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

    var helpText = {
      android:
        "Android may ask you to allow installs from your browser. Kakeibo is a direct APK, not a Play Store listing.",
      linux:
        "Make the AppImage executable before opening it: chmod +x Kakeibo-1.0.0.AppImage.",
      ios:
        "There is no native build for iPhone or iPad yet. The web app works in a modern browser.",
      macos:
        "There is no native build for macOS yet. The web app works in a modern browser.",
      windows:
        "There is no native build for Windows yet. The web app works in a modern browser.",
      chromeos:
        "There is no native build for ChromeOS yet. The web app works in a modern browser.",
      web:
        "Opens in your browser. Your records stay in this browser unless you export a backup."
    };

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

    var help = document.getElementById("dl-help");
    if (help) {
      help.textContent = helpText[detected] || helpText.web;
      help.hidden = false;
    }
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
