import { createContext, useContext } from 'react'

export const AmountPrivacyContext = createContext(true)

export function useAmountsHidden(): boolean {
  return useContext(AmountPrivacyContext)
}
