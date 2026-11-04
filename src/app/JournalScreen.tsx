import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Bot, BookOpen, CalendarDays, FileText, Highlighter, Plus, RotateCcw, Save, Search, Trash2, Pencil } from 'lucide-react'
import { db, type JournalEntry, type JournalHighlight } from '@/db/db'
import { deleteJournalEntry, restoreJournalEntry, saveJournalEntry } from '@/db/repo'

const PROMPTS = [
  'What is on my mind about money?',
  'What felt worth it today?',
  'What would I like to do differently next time?',
  'What am I grateful to have spent on?',
  'What do I want to make room for?',
]

const MOODS = ['Reflective', 'Hopeful', 'Worried', 'Grateful', 'Unsure']
const HIGHLIGHT_COLORS = [
  { name: 'Sage', color: '#dce9d5' },
  { name: 'Butter', color: '#f5e8b8' },
  { name: 'Rose', color: '#f1d8d2' },
]

type JournalView = 'list' | 'read' | 'edit'

function today(): string {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function formatDate(value: string): string {
  const date = new Date(`${value}T12:00:00`)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function noteTitle(entry: Pick<JournalEntry, 'title' | 'body'>): string {
  return entry.title || entry.body.split('\n').find((line) => line.trim())?.slice(0, 60) || 'Untitled note'
}

function noteExcerpt(body: string): string {
  const excerpt = body.replace(/\s+/g, ' ').trim()
  return excerpt.length > 180 ? `${excerpt.slice(0, 180).trimEnd()}…` : excerpt
}

function adjustHighlights(highlights: JournalHighlight[], oldText: string, newText: string): JournalHighlight[] {
  let prefix = 0
  while (prefix < oldText.length && prefix < newText.length && oldText[prefix] === newText[prefix]) prefix += 1
  let oldEnd = oldText.length
  let newEnd = newText.length
  while (oldEnd > prefix && newEnd > prefix && oldText[oldEnd - 1] === newText[newEnd - 1]) {
    oldEnd -= 1
    newEnd -= 1
  }
  const delta = newEnd - oldEnd
  const mapPosition = (position: number) => position <= prefix ? position : position >= oldEnd ? position + delta : newEnd
  return highlights
    .map((highlight) => ({ ...highlight, start: mapPosition(highlight.start), end: mapPosition(highlight.end) }))
    .filter((highlight) => highlight.end > highlight.start && highlight.start >= 0 && highlight.end <= newText.length)
}

function HighlightedBody({ body, highlights }: { body: string; highlights: JournalHighlight[] }) {
  const ordered = [...highlights].filter((item) => item.start >= 0 && item.end <= body.length && item.end > item.start && /^#[\da-f]{6}$/i.test(item.color)).sort((a, b) => a.start - b.start)
  const parts: React.ReactNode[] = []
  let cursor = 0
  for (const [index, highlight] of ordered.entries()) {
    const start = Math.max(cursor, highlight.start)
    if (start > cursor) parts.push(<span key={`text-${index}`}>{body.slice(cursor, start)}</span>)
    if (highlight.end > start) {
      parts.push(<mark key={`mark-${index}`} className="journal-highlight" style={{ backgroundColor: highlight.color }}>{body.slice(start, highlight.end)}</mark>)
      cursor = highlight.end
    }
  }
  if (cursor < body.length) parts.push(<span key="text-end">{body.slice(cursor)}</span>)
  return <div className="journal-read-body">{parts}</div>
}

export function JournalScreen({ onChanged, notify }: { onChanged: () => Promise<void>; notify: (message: string) => void }) {
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [search, setSearch] = useState('')
  const [showDeleted, setShowDeleted] = useState(false)
  const [selectedId, setSelectedId] = useState<string>()
  const [view, setView] = useState<JournalView>('list')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [date, setDate] = useState(today)
  const [mood, setMood] = useState('')
  const [tagsText, setTagsText] = useState('')
  const [highlights, setHighlights] = useState<JournalHighlight[]>([])
  const [isDirty, setIsDirty] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const bodyRef = useRef<HTMLTextAreaElement>(null)

  const loadEntries = useCallback(async () => {
    setEntries(await db.journals.orderBy('updatedAt').reverse().toArray())
  }, [])

  useEffect(() => {
    void loadEntries().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Could not load journal notes.'))
  }, [loadEntries])

  const activeEntries = useMemo(() => entries.filter((entry) => showDeleted ? Boolean(entry.deletedAt) : !entry.deletedAt), [entries, showDeleted])
  const visibleEntries = useMemo(() => {
    const query = search.trim().toLocaleLowerCase()
    if (!query) return activeEntries
    return activeEntries.filter((entry) => [entry.title, entry.body, entry.date, entry.mood, ...entry.tags].join(' ').toLocaleLowerCase().includes(query))
  }, [activeEntries, search])
  const selected = entries.find((entry) => entry.id === selectedId)
  const wordCount = body.trim() ? body.trim().split(/\s+/).length : 0

  function confirmDiscard(): boolean {
    return !isDirty || window.confirm('Discard your unsaved changes?')
  }

  function clearDraft() {
    setSelectedId(undefined)
    setTitle('')
    setBody('')
    setDate(today())
    setMood('')
    setTagsText('')
    setHighlights([])
    setIsDirty(false)
    setError('')
  }

  function startNew() {
    if (!confirmDiscard()) return
    clearDraft()
    setView('edit')
  }

  function openEntry(entry: JournalEntry) {
    if (!confirmDiscard()) return
    setSelectedId(entry.id)
    setView('read')
    setTitle(entry.title)
    setBody(entry.body)
    setDate(entry.date)
    setMood(entry.mood)
    setTagsText(entry.tags.join(', '))
    setHighlights(entry.highlights ?? [])
    setIsDirty(false)
    setError('')
  }

  function editEntry() {
    setView('edit')
    setIsDirty(false)
    setError('')
  }

  function insertPrompt(prompt: string) {
    const next = `${body.trimEnd()}${body.trim() ? '\n\n' : ''}${prompt}\n`
    setHighlights((items) => adjustHighlights(items, body, next))
    setBody(next)
    setIsDirty(true)
  }

  function updateBody(next: string) {
    setHighlights((current) => adjustHighlights(current, body, next))
    setBody(next)
    setIsDirty(true)
  }

  function highlightSelection(color: string) {
    const input = bodyRef.current
    if (!input) return
    const start = input.selectionStart
    const end = input.selectionEnd
    if (start === end) {
      setError('Select a word or phrase first, then choose a highlight color.')
      return
    }
    setHighlights((current) => [
      ...current.filter((item) => item.end <= start || item.start >= end),
      { start, end, color },
    ].sort((a, b) => a.start - b.start))
    setIsDirty(true)
    setError('')
    requestAnimationFrame(() => {
      input.focus()
      input.setSelectionRange(start, end)
    })
  }

  async function save() {
    if (isSaving) return
    setIsSaving(true)
    setError('')
    try {
      const saved = await saveJournalEntry({
        title,
        body,
        date,
        mood,
        tags: tagsText.split(','),
        highlights,
      }, selectedId)
      setSelectedId(saved.id)
      setTitle(saved.title)
      setBody(saved.body)
      setHighlights(saved.highlights ?? [])
      setIsDirty(false)
      setView('read')
      await loadEntries()
      await onChanged()
      notify('Journal note saved')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save your note.')
    } finally {
      setIsSaving(false)
    }
  }

  async function moveToRecentlyDeleted() {
    if (!selectedId || !confirmDiscard() || !window.confirm('Move this note to recently deleted? You can restore it later.')) return
    try {
      await deleteJournalEntry(selectedId)
      clearDraft()
      setView('list')
      await loadEntries()
      await onChanged()
      notify('Note moved to recently deleted')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not move this note to recently deleted.')
    }
  }

  async function restore(entry: JournalEntry) {
    try {
      await restoreJournalEntry(entry.id)
      await loadEntries()
      await onChanged()
      notify('Journal note restored')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not restore this note.')
    }
  }

  function backToList() {
    if (!confirmDiscard()) return
    setView('list')
    setIsDirty(false)
    setError('')
  }

  const hasSelected = Boolean(selected && !selected.deletedAt)
  const showList = view === 'list'
  const showNote = view === 'read' && hasSelected
  const showEditor = view === 'edit' && (!selected || !selected.deletedAt)

  return <section className={`journal-layout journal-view-${view}`}>
    <aside className="journal-list panel">
      <div className="journal-list-head">
        <div><span className="overline">A QUIET PLACE TO WRITE</span><h2>Your journal</h2></div>
        <button className="button-primary journal-new" onClick={startNew}><Plus size={16} /> New note</button>
      </div>
      <p className="journal-local-note">A private space for money thoughts, plans, or anything on your mind.</p>
      <label className="journal-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search your notes" aria-label="Search journal" /></label>
      <div className="journal-list-tabs">
        <button className={!showDeleted ? 'active' : ''} onClick={() => setShowDeleted(false)}>Notes</button>
        <button className={showDeleted ? 'active' : ''} onClick={() => setShowDeleted(true)}>Recently deleted</button>
      </div>
      <div className="journal-entries">
        {visibleEntries.map((entry) => <div key={entry.id} className="journal-entry-card">
          <button className={`journal-entry ${selectedId === entry.id ? 'selected' : ''}`} onClick={() => showDeleted ? undefined : openEntry(entry)}>
            <span className="journal-entry-top"><b>{noteTitle(entry)}</b><time>{formatDate(entry.date)}</time></span>
            <span className="journal-entry-excerpt">{noteExcerpt(entry.body)}</span>
            {entry.mood && <span className="journal-mood">{entry.mood}</span>}
          </button>
          {showDeleted && <button className="journal-restore" onClick={() => void restore(entry)}><RotateCcw size={13} /> Restore</button>}
        </div>)}
        {!visibleEntries.length && <div className="journal-empty"><BookOpen size={22} /><b>{search ? 'No matching notes' : showDeleted ? 'Nothing here' : 'A fresh page'}</b><span>{search ? 'Try another word or date.' : showDeleted ? 'Deleted notes will appear here.' : 'Start with a prompt or write whatever comes to mind.'}</span></div>}
      </div>
    </aside>

    {showList && <div className="journal-detail-placeholder panel"><BookOpen size={26} /><h2>Make room to reflect.</h2><p>Choose a note to read, or start a new page.</p></div>}

    {showNote && selected && <article className="journal-reader panel">
      <div className="journal-reader-toolbar">
        <button className="journal-back icon-button" aria-label="Back to notes" title="Back to notes" onClick={backToList}><ArrowLeft size={17} /></button>
        <div className="journal-reader-actions">
          <button className="icon-button" aria-label="Edit note" title="Edit note" onClick={editEntry}><Pencil size={16} /></button>
          <button className="icon-button" aria-label="Delete note" title="Move to recently deleted" onClick={() => void moveToRecentlyDeleted()}><Trash2 size={16} /></button>
          <button className="icon-button journal-ai-placeholder" aria-label="AI tools coming soon" title="AI tools coming soon" disabled><Bot size={17} /><span>AI</span></button>
        </div>
      </div>
      <div className="journal-reader-meta"><time>{formatDate(selected.date)}</time>{selected.mood && <span className="journal-mood">{selected.mood}</span>}</div>
      <h2 className="journal-reader-title">{selected.title || 'A note to self'}</h2>
      <HighlightedBody body={selected.body} highlights={selected.highlights ?? []} />
      {selected.tags.length > 0 && <div className="journal-reader-tags">{selected.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div>}
    </article>}

    {showEditor && <div className="journal-editor panel">
      <div className="journal-editor-head">
        <button className="journal-back icon-button" aria-label="Back to notes" title="Back to notes" onClick={backToList}><ArrowLeft size={17} /></button>
        <div><span className="overline">{selected ? 'EDIT NOTE' : 'A NEW PAGE'}</span><div className={`journal-save-status ${isDirty ? 'unsaved' : ''}`}>{isDirty ? 'Unsaved changes' : selected ? 'Saved on this device' : 'Only saved on this device'}</div></div>
        <button className="button-primary" onClick={() => void save()} disabled={isSaving || !body.trim()}><Save size={15} /> {isSaving ? 'Saving…' : 'Save note'}</button>
      </div>
      <input className="journal-title" value={title} onChange={(event) => { setTitle(event.target.value); setIsDirty(true) }} placeholder="Give this note a title (optional)" aria-label="Note title" maxLength={120} />
      <label className="journal-body-label" htmlFor="journal-body">Write freely. No budget categories, no right or wrong way.</label>
      <div className="journal-highlight-tools" aria-label="Text highlight colors">
        <span><Highlighter size={14} /> Highlight selection</span>
        {HIGHLIGHT_COLORS.map(({ name, color }) => <button key={name} type="button" className="journal-highlight-color" aria-label={`Highlight selection ${name}`} title={`Highlight selection ${name}`} style={{ backgroundColor: color }} onMouseDown={(event) => event.preventDefault()} onClick={() => highlightSelection(color)} />)}
      </div>
      <textarea ref={bodyRef} id="journal-body" className="journal-body" value={body} onChange={(event) => updateBody(event.target.value)} placeholder="What would you like to put into words today?" />
      <div className="journal-editor-meta">
        <label><CalendarDays size={15} /><span className="sr-only">Note date</span><input type="date" value={date} onChange={(event) => { setDate(event.target.value); setIsDirty(true) }} /></label>
        <label><FileText size={15} /><span className="sr-only">Mood</span><select value={mood} onChange={(event) => { setMood(event.target.value); setIsDirty(true) }}><option value="">How are you feeling? (optional)</option>{MOODS.map((value) => <option key={value}>{value}</option>)}</select></label>
        <span>{wordCount} {wordCount === 1 ? 'word' : 'words'}</span>
      </div>
      <label className="journal-tags"><span>Tags <small>Optional · separate with commas</small></span><input value={tagsText} onChange={(event) => { setTagsText(event.target.value); setIsDirty(true) }} placeholder="e.g. goals, family, work" /></label>
      <div className="journal-prompts"><span>Need a starting point?</span><div>{PROMPTS.map((prompt) => <button key={prompt} onClick={() => insertPrompt(prompt)}>{prompt}</button>)}</div></div>
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>}

    {selected?.deletedAt && <div className="journal-editor-empty panel"><Trash2 size={26} /><h2>This note is in recently deleted</h2><button className="button-primary" onClick={() => void restore(selected)}><RotateCcw size={15} /> Restore note</button></div>}
    {error && !showEditor && <p className="form-error journal-error" role="alert">{error}</p>}
  </section>
}
