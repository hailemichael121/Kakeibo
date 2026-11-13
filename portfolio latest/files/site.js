(function () {
  "use strict";

  var root = document.documentElement;
  root.classList.add("js");

  function init() {
    var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var toggle = document.querySelector("[data-nav-toggle]");
    var menu = document.getElementById("site-menu");

    if (toggle && menu) {
      var label = toggle.querySelector("[data-nav-label]");

      var setOpen = function (open) {
        toggle.setAttribute("aria-expanded", String(open));
        menu.classList.toggle("is-open", open);
        if (label) {
          label.textContent = open ? "Close" : "Menu";
        }
      };

      toggle.addEventListener("click", function () {
        setOpen(toggle.getAttribute("aria-expanded") !== "true");
      });

      menu.addEventListener("click", function (event) {
        if (event.target.closest("a")) {
          setOpen(false);
        }
      });

      document.addEventListener("keydown", function (event) {
        if (event.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") {
          setOpen(false);
          toggle.focus();
        }
      });

      document.addEventListener("click", function (event) {
        if (
          toggle.getAttribute("aria-expanded") === "true" &&
          !menu.contains(event.target) &&
          !toggle.contains(event.target)
        ) {
          setOpen(false);
        }
      });

      var wide = window.matchMedia("(min-width: 901px)");
      var closeOnWide = function (event) {
        if (event.matches) {
          setOpen(false);
        }
      };
      if (wide.addEventListener) {
        wide.addEventListener("change", closeOnWide);
      } else if (wide.addListener) {
        wide.addListener(closeOnWide);
      }
    }

    var revealItems = document.querySelectorAll("[data-reveal]");
    if (revealItems.length) {
      if (!("IntersectionObserver" in window) || reduceMotion) {
        revealItems.forEach(function (item) {
          item.classList.add("is-visible");
        });
      } else {
        var revealObserver = new IntersectionObserver(
          function (entries) {
            entries.forEach(function (entry) {
              if (entry.isIntersecting) {
                entry.target.classList.add("is-visible");
                revealObserver.unobserve(entry.target);
              }
            });
          },
          { rootMargin: "0px 0px -8% 0px", threshold: 0.12 }
        );
        revealItems.forEach(function (item) {
          revealObserver.observe(item);
        });
      }
    }

    var artItems = document.querySelectorAll("[data-art]");
    if (artItems.length && !reduceMotion) {
      var prepareArt = function (svg) {
        svg.querySelectorAll("path, ellipse, circle, line, rect").forEach(function (shape, index) {
          if (shape.classList.contains("wash")) {
            return;
          }
          shape.setAttribute("pathLength", "1");
          shape.classList.add("draw");
          shape.style.setProperty("--d", Math.min(index * 0.035, 0.7) + "s");
        });
      };

      if (!("IntersectionObserver" in window)) {
        artItems.forEach(function (svg) {
          prepareArt(svg);
          svg.classList.add("is-drawn");
        });
      } else {
        var artObserver = new IntersectionObserver(
          function (entries) {
            entries.forEach(function (entry) {
              if (entry.isIntersecting) {
                entry.target.classList.add("is-drawn");
                artObserver.unobserve(entry.target);
              }
            });
          },
          { rootMargin: "0px 0px -6% 0px", threshold: 0.08 }
        );

        artItems.forEach(function (svg) {
          prepareArt(svg);
          artObserver.observe(svg);
        });
      }
    }

    var detected = detectPlatform();
    root.dataset.detectedPlatform = detected;

    var names = {
      android: "Android",
      linux: "Linux",
      ios: "iPhone or iPad",
      macos: "Mac",
      windows: "Windows",
      chromeos: "ChromeOS",
      web: "your device"
    };

    var navLabels = {
      android: "Get for Android",
      linux: "Get for Linux",
      ios: "Open web app",
      macos: "Open web app",
      windows: "Open web app",
      chromeos: "Open web app",
      web: "Open web app"
    };

    var heroLabels = {
      android: "Get Kakeibo for Android",
      linux: "Get Kakeibo for Linux",
      ios: "Open the web app",
      macos: "Open the web app",
      windows: "Open the web app",
      chromeos: "Open the web app",
      web: "Open the web app"
    };

    var guides = {
      android: {
        title: "Installing on Android",
        intro:
          "Kakeibo is a <b>direct APK</b>, not a Play Store app, so Android stops it once with a security guard. That prompt is expected, and it takes a few taps to pass.",
        steps: [
          "Tap <b>Download APK</b> and let the file finish downloading. It lands in <b>Downloads</b>.",
          "Open it from the download notification or from <b>Files → Downloads</b>. Android shows <b>“For your security, your phone is not allowed to install unknown apps from this source.”</b>",
          "Tap <b>Settings</b> in that dialog, switch on <b>Allow from this source</b>, then press <b>Back</b>. The install screen returns.",
          "If <b>Play Protect</b> warns that the app was not scanned, choose <b>More details → Install anyway</b>.",
          "Tap <b>Install</b>, then <b>Open</b>. No account, no sign-in — everything stays on the phone."
        ],
        command: {
          label: "Or install over a cable with ADB",
          value: "adb install Kakeibo.apk"
        },
        verify: {
          label: "Check the file before installing",
          command: "sha256sum Kakeibo.apk",
          expected: "7fcd4ee85a5bd5fe36d9d93a7e3c912e89f87595b5f6982ec132adc4f8e4a0e2",
          note:
            "Compare with the <a href=\"./downloads/SHA256SUMS\">SHA256SUMS</a> entry for <b>Kakeibo.apk</b>. On a phone, use a checksum app, or copy the APK to a computer and run the command there."
        },
        note:
          "To undo step 3 later: <b>Settings → Apps → Special app access → Install unknown apps</b>. Turn the permission back off once Kakeibo is installed, and only allow sources you trust."
      },
      linux: {
        title: "Running the AppImage",
        intro:
          "An AppImage is a single portable file. It needs to be marked executable once before it will start.",
        steps: [
          "Download <b>Kakeibo-1.0.4.AppImage</b>.",
          "Make it executable: right-click it and choose <b>Properties → Permissions → Allow executing file as program</b>, or use the command below.",
          "Double-click the file to open Kakeibo. Move it anywhere you like — a folder in your home directory is fine.",
          "If nothing opens on Ubuntu 22.04 or newer, install <b>libfuse2</b> or use the <b>.deb</b> package instead."
        ],
        command: {
          label: "In a terminal, from your Downloads folder",
          value: "chmod +x Kakeibo-1.0.4.AppImage && ./Kakeibo-1.0.4.AppImage"
        },
        verify: {
          label: "Check the file before running it",
          command: "sha256sum Kakeibo-1.0.4.AppImage",
          expected: "c532bcf9bc9c61ad38a12e43b68ee3b1d20e03918cc96ffe3d5435cce59bf498",
          note:
            "Compare with the <a href=\"./downloads/SHA256SUMS\">SHA256SUMS</a> entry for <b>Kakeibo-1.0.4.AppImage</b>. If the values differ, delete the file and download it again."
        },
        note: "Nothing is installed system-wide. Deleting the file removes Kakeibo."
      },
      "linux-deb": {
        title: "Installing the .deb package",
        intro:
          "The Debian package adds Kakeibo to your applications menu and updates it alongside the rest of your system.",
        steps: [
          "Download <b>kakeibo_1.0.4_amd64.deb</b>.",
          "Double-click it and press <b>Install</b> in your software installer, or use the command below.",
          "Launch <b>Kakeibo</b> from your applications menu."
        ],
        command: {
          label: "In a terminal, from your Downloads folder",
          value: "sudo apt install ./kakeibo_1.0.4_amd64.deb"
        },
        verify: {
          label: "Check the package before installing it",
          command: "sha256sum kakeibo_1.0.4_amd64.deb",
          expected: "8119df7011b79ff278339fb411cfaefd3e9d3c8c785783afee372ca954f499cd",
          note:
            "Compare with the <a href=\"./downloads/SHA256SUMS\">SHA256SUMS</a> entry for <b>kakeibo_1.0.4_amd64.deb</b>. If the values differ, delete the file and download it again."
        },
        note:
          "Keep the <b>./</b> in front of the filename. It tells apt to read the local file instead of searching the repositories."
      },
      windows: {
        title: "Installing on Windows",
        intro:
          "The build is new and unsigned, so <b>SmartScreen</b> may ask once before it runs.",
        steps: [
          "Download <b>Kakeibo-Setup-1.0.0.exe</b>.",
          "Run the file. If <b>“Windows protected your PC”</b> appears, press <b>More info → Run anyway</b>.",
          "Follow the installer, then launch Kakeibo from the Start menu."
        ],
        verify: {
          label: "Check the file before running it",
          command: "certutil -hashfile Kakeibo-Setup-1.0.0.exe SHA256",
          expected: "218b392db42eb4a07dec332a71e5fabb3e9e9ef9be2858021a83b0673c85d272",
          note:
            "Compare with the <a href=\"./downloads/SHA256SUMS\">SHA256SUMS</a> entry for <b>Kakeibo-Setup-1.0.0.exe</b>. In PowerShell, <b>Get-FileHash .\\Kakeibo-Setup-1.0.0.exe</b> prints the same value. If the values differ, delete the file and download it again."
        },
        note: "Only bypass SmartScreen for a file you downloaded from this page. The installer is unsigned, so there is no publisher signature to verify."
      },
      macos: {
        title: "Installing on macOS",
        intro:
          "The build is unsigned, so macOS blocks the first launch until you approve it in <b>Privacy &amp; Security</b>.",
        steps: [
          "Download <b>Kakeibo-1.0.0.dmg</b> and open it.",
          "Drag <b>Kakeibo</b> into your <b>Applications</b> folder.",
          "Open it once. If macOS refuses, go to <b>System Settings → Privacy &amp; Security</b> and choose <b>Open Anyway</b>.",
          "Confirm with your password or Touch ID."
        ],
        note: "After that first launch, Kakeibo opens like any other app. The build is unsigned, so there is no publisher signature to verify, and it is not in the SHA256SUMS manifest until it is published."
      },
      web: {
        title: "Using the web app",
        intro:
          "Kakeibo runs from this site in a modern browser. Nothing is installed and nothing is uploaded.",
        steps: [
          "Press <b>Open web app</b>. It loads from this site, so it keeps working offline afterwards.",
          "For a full-screen window, install it: <b>Install</b> in Chrome or Edge, or <b>Share → Add to Home Screen</b> on iOS.",
          "Your records stay in this browser. Export a backup from inside the app before clearing site data."
        ],
        note: "Clearing browser data deletes the ledger. A backup is the only copy."
      }
    };

    var copyToClipboard = function (text) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(text);
      }
      return new Promise(function (resolve, reject) {
        var field = document.createElement("textarea");
        field.value = text;
        field.setAttribute("readonly", "");
        field.style.position = "fixed";
        field.style.top = "-1000px";
        document.body.appendChild(field);
        field.select();
        try {
          document.execCommand("copy") ? resolve() : reject(new Error("copy failed"));
        } catch (error) {
          reject(error);
        }
        document.body.removeChild(field);
      });
    };

    var selectText = function (node) {
      var selection = window.getSelection();
      if (!selection) {
        return;
      }
      var range = document.createRange();
      range.selectNodeContents(node);
      selection.removeAllRanges();
      selection.addRange(range);
    };

    document.querySelectorAll("[data-copy]").forEach(function (button) {
      var original = button.textContent;
      var resetTimer = null;

      button.addEventListener("click", function () {
        var target = document.getElementById(button.getAttribute("data-copy"));
        if (!target) {
          return;
        }

        var value = (target.textContent || "").trim();
        if (!value) {
          return;
        }

        var restore = function (label) {
          button.textContent = label;
          button.classList.remove("is-copied");
          window.clearTimeout(resetTimer);
          resetTimer = window.setTimeout(function () {
            button.textContent = original;
          }, 2200);
        };

        copyToClipboard(value).then(
          function () {
            button.textContent = "Copied";
            button.classList.add("is-copied");
            window.clearTimeout(resetTimer);
            resetTimer = window.setTimeout(function () {
              button.textContent = original;
              button.classList.remove("is-copied");
            }, 1800);
          },
          function () {
            selectText(target);
            restore("Selected — copy now");
          }
        );
      });
    });

    document.querySelectorAll("[data-dl-nav]").forEach(function (link) {
      link.textContent = navLabels[detected] || "Get Kakeibo";
    });

    document.querySelectorAll("[data-dl-hero]").forEach(function (link) {
      link.textContent = heroLabels[detected] || "Get Kakeibo";
    });

    var options = Array.prototype.slice.call(document.querySelectorAll(".dl-option[data-platform]"));
    if (!options.length) {
      return;
    }

    var recommended = options.filter(function (option) {
      return option.getAttribute("data-platform") === detected;
    })[0];

    if (!recommended) {
      recommended = options.filter(function (option) {
        return option.getAttribute("data-platform") === "web";
      })[0];
    }

    if (!recommended) {
      return;
    }

    recommended.classList.add("is-recommended");

    var copy = recommended.querySelector(".dl-copy");
    if (copy) {
      var badge = document.createElement("span");
      badge.className = "dl-badge";
      badge.textContent = "Recommended for " + (names[detected] || "your device");
      copy.insertBefore(badge, copy.firstChild);
    }

    var list = recommended.parentNode;
    if (list && list.firstElementChild !== recommended) {
      list.insertBefore(recommended, list.firstElementChild);
    }

    var alt = document.getElementById("dl-alt");
    var other = document.getElementById("dl-other");
    if (alt && other) {
      options.forEach(function (option) {
        if (option !== recommended) {
          alt.appendChild(option);
        }
      });
      other.hidden = false;
    }

    var panel = document.getElementById("dl-help-panel");
    var helpToggles = Array.prototype.slice.call(document.querySelectorAll("[data-dl-help]"));
    var activeToggle = null;

    if (!panel || !helpToggles.length) {
      return;
    }

    var setToggleState = function () {
      helpToggles.forEach(function (button) {
        button.setAttribute("aria-expanded", String(button === activeToggle));
      });
    };

    var setToggleState = function () {
      var row = document.createElement("div");
      row.className = "dl-help-command";

      var code = document.createElement("code");
      code.textContent = value;

      var copyButton = document.createElement("button");
      copyButton.type = "button";
      copyButton.className = "dl-help-copy-btn";
      copyButton.textContent = "Copy";
      copyButton.addEventListener("click", function () {
        copyToClipboard(value).then(
          function () {
            copyButton.textContent = "Copied";
            copyButton.classList.add("is-copied");
            window.setTimeout(function () {
              copyButton.textContent = "Copy";
              copyButton.classList.remove("is-copied");
            }, 1800);
          },
          function () {
            selectText(code);
            copyButton.textContent = "Selected — copy now";
          }
        );
      });

      row.appendChild(code);
      row.appendChild(copyButton);
      return row;
    };

    var closeGuide = function (returnFocus) {
      if (panel.hidden) {
        return;
      }
      panel.hidden = true;
      panel.setAttribute("aria-hidden", "true");
      if (returnFocus && activeToggle) {
        activeToggle.focus();
      }
      activeToggle = null;
      setToggleState();
    };

    var renderGuide = function (key) {
      var guide = guides[key] || guides.web;
      panel.innerHTML = "";

      var head = document.createElement("div");
      head.className = "dl-help-head";

      var title = document.createElement("h3");
      title.id = "dl-help-title";
      title.textContent = guide.title;

      var close = document.createElement("button");
      close.type = "button";
      close.className = "dl-help-close";
      close.textContent = "Close";
      close.addEventListener("click", function () {
        closeGuide(true);
      });

      head.appendChild(title);
      head.appendChild(close);

      var body = document.createElement("div");
      body.className = "dl-help-inner";

      if (guide.intro) {
        var intro = document.createElement("p");
        intro.className = "dl-help-copy";
        intro.innerHTML = guide.intro;
        body.appendChild(intro);
      }

      if (guide.steps && guide.steps.length) {
        var stepsSection = document.createElement("div");
        stepsSection.className = "dl-help-section";

        var stepsTitle = document.createElement("h4");
        stepsTitle.textContent = "Step by step";

        var list = document.createElement("ol");
        list.className = "dl-help-steps";
        guide.steps.forEach(function (text, index) {
          var item = document.createElement("li");
          var num = document.createElement("span");
          num.className = "dl-help-num";
          num.setAttribute("aria-hidden", "true");
          num.textContent = index < 9 ? "0" + (index + 1) : String(index + 1);

          var copy = document.createElement("span");
          copy.innerHTML = text;

          item.appendChild(num);
          item.appendChild(copy);
          list.appendChild(item);
        });

        stepsSection.appendChild(stepsTitle);
        stepsSection.appendChild(list);
        body.appendChild(stepsSection);
      }

      if (guide.command) {
        var commandSection = document.createElement("div");
        commandSection.className = "dl-help-section";

        var commandTitle = document.createElement("h4");
        commandTitle.textContent = guide.command.label;

        commandSection.appendChild(commandTitle);
        commandSection.appendChild(buildCommandRow(guide.command.value));
        body.appendChild(commandSection);
      }

      if (guide.verify) {
        var verifySection = document.createElement("div");
        verifySection.className = "dl-help-section";

        var verifyTitle = document.createElement("h4");
        verifyTitle.textContent = guide.verify.label || "Verify the download";

        verifySection.appendChild(verifyTitle);
        verifySection.appendChild(buildCommandRow(guide.verify.command));

        if (guide.verify.expected) {
          var hash = document.createElement("div");
          hash.className = "dl-help-hash";

          var hashLabel = document.createElement("span");
          hashLabel.textContent = "Expected SHA-256";

          var hashValue = document.createElement("code");
          hashValue.textContent = guide.verify.expected;

          hash.appendChild(hashLabel);
          hash.appendChild(hashValue);
          verifySection.appendChild(hash);
        }

        if (guide.verify.note) {
          var verifyNote = document.createElement("p");
          verifyNote.className = "dl-help-note";
          verifyNote.innerHTML = guide.verify.note;
          verifySection.appendChild(verifyNote);
        }

        body.appendChild(verifySection);
      }

      if (guide.note) {
        var note = document.createElement("p");
        note.className = "dl-help-note";
        note.innerHTML = guide.note;
        body.appendChild(note);
      }

      panel.setAttribute("aria-labelledby", "dl-help-title");
      panel.appendChild(head);
      panel.appendChild(body);
    };

    var openGuide = function (button) {
      if (activeToggle === button && !panel.hidden) {
        closeGuide(true);
        return;
      }

      renderGuide(button.getAttribute("data-dl-help"));
      activeToggle = button;
      panel.hidden = false;
      panel.setAttribute("aria-hidden", "false");
      setToggleState();

      var box = panel.getBoundingClientRect();
      if (box.bottom < 0 || box.top > window.innerHeight - 96) {
        panel.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
      }
    };

    helpToggles.forEach(function (button) {
      button.addEventListener("click", function () {
        openGuide(button);
      });
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && !panel.hidden) {
        closeGuide(true);
      }
    });
  }

  function detectPlatform() {
    var ua = navigator.userAgent || "";
    var data = navigator.userAgentData;
    var platform = (data && data.platform) || navigator.platform || "";
    var p = platform.toLowerCase();
    var touchPoints = navigator.maxTouchPoints || 0;

    if (/ipad/i.test(ua) || ((p === "macintel" || p.indexOf("mac") !== -1) && touchPoints > 1)) {
      return "ios";
    }
    if (/android/i.test(ua)) {
      return "android";
    }
    if (/iphone|ipod/i.test(ua)) {
      return "ios";
    }
    if (/cros/i.test(ua) || p.indexOf("chrome os") !== -1) {
      return "chromeos";
    }
    if (p.indexOf("win") !== -1 || /windows/i.test(ua)) {
      return "windows";
    }
    if (p.indexOf("mac") !== -1) {
      return "macos";
    }
    if (p.indexOf("linux") !== -1 || (/linux/i.test(ua) && !/android/i.test(ua))) {
      return "linux";
    }
    return "web";
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
