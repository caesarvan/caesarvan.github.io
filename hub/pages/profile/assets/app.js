const langToggleId = "lang-toggle";
const menuToggleId = "menu-toggle";
const mobileNavId = "mobile-nav";
const themeToggleId = "theme-toggle";
const themeMedia = window.matchMedia("(prefers-color-scheme: dark)");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const urlLang = new URLSearchParams(window.location.search).get("lang");
let lang = urlLang === "en" || urlLang === "zh"
  ? urlLang
  : localStorage.getItem("site-lang") === "en"
    ? "en"
    : "zh";
let dieAnim = 0;
let telemetryAnim = 0;
let activeStageId = window.location.hash.replace("#stage-", "");
let stageScrollHandler = null;
let stageRevealObserver = null;

function pageName() {
  return document.body.getAttribute("data-page") || "home";
}

function resolvedTheme() {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

function themeIcon(theme) {
  if (theme === "dark") {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v2m0 14v2M3 12h2m14 0h2M5.64 5.64l1.42 1.42m9.88 9.88 1.42 1.42M18.36 5.64l-1.42 1.42M7.06 16.94l-1.42 1.42"/><circle cx="12" cy="12" r="4"/></svg>';
  }
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.2 15.1A8.5 8.5 0 0 1 8.9 3.8 8.5 8.5 0 1 0 20.2 15.1Z"/></svg>';
}

function updateThemeToggle() {
  const toggle = document.getElementById(themeToggleId);
  if (!toggle) {
    return;
  }
  const theme = resolvedTheme();
  toggle.innerHTML = themeIcon(theme);
  toggle.setAttribute(
    "aria-label",
    theme === "dark" ? I18N[lang]["theme.toLight"] : I18N[lang]["theme.toDark"],
  );
  toggle.title = toggle.getAttribute("aria-label");
}

function setTheme(theme, persist) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  if (persist) {
    localStorage.setItem("color-theme", theme);
  }
  updateThemeToggle();
}

function renderChrome() {
  const header = document.getElementById("site-header");
  const footer = document.getElementById("site-footer");
  const page = pageName();
  if (document.documentElement.dataset.profileEmbedded === "true") {
    const tabs = [
      ["index.html", "home", "nav.home"],
      ["work.html", "work", "nav.work"],
      ["projects.html", "projects", "nav.projects"],
      ["awards.html", "awards", "nav.awards"],
      ["about.html", "about", "nav.about"],
      ["contact.html", "contact", "nav.contact"],
    ].map(([href, id, key]) => `<a href="${href}?embed=1${lang === "en" ? "&lang=en" : ""}" data-i18n="${key}"${page === id ? ' class="active" aria-current="page"' : ""}></a>`).join("");
    header.innerHTML = `<div class="profile-tools"><nav class="profile-tabs" aria-label="个人主页 / Profile">${tabs}</nav><button type="button" class="lang-toggle" id="${langToggleId}" aria-pressed="false" aria-label="Language">EN</button></div>`;
    footer.replaceChildren();
    return;
  }
  const links = [
    ["index.html", "", "home", "nav.home"],
    ["index.html", "#timeline", "timeline", "nav.timeline"],
    ["projects.html", "", "projects", "nav.projects"],
    ["contact.html", "", "contact", "nav.contact"],
  ];

  const localeSuffix = lang === "en" ? "?lang=en" : "";
  const navHtml = links
    .map(([href, hash, id, key]) => {
      const active = id === page ? ' aria-current="page" class="active"' : "";
      return `<a href="${href}${localeSuffix}${hash}" data-nav-id="${id}" data-i18n="${key}"${active}></a>`;
    })
    .join("");

  header.innerHTML = `
    <header class="site-header">
      <a class="brand" href="index.html${localeSuffix}">
        <span class="brand-monogram" aria-hidden="true">CF</span>
        <span class="brand-text">
          <span class="brand-name">Caesar Fan</span>
          <span class="brand-tag">GPU Power Verification</span>
        </span>
      </a>
      <nav class="nav" aria-label="Primary">${navHtml}</nav>
      <div class="header-actions">
        <button type="button" class="theme-toggle" id="${themeToggleId}"></button>
        <button type="button" class="lang-toggle" id="${langToggleId}" aria-pressed="false" aria-label="Language">EN</button>
        <button type="button" class="menu-toggle" id="${menuToggleId}" aria-expanded="false" aria-controls="${mobileNavId}">
          <span data-i18n="nav.menu">Menu</span>
        </button>
      </div>
      <div class="scroll-progress" id="scroll-progress" aria-hidden="true"></div>
    </header>
    <div class="mobile-nav" id="${mobileNavId}" hidden>${navHtml}</div>
  `;

  footer.innerHTML = `
    <footer class="site-footer">
      <span data-i18n="footer.copy">Caesar Fan</span>
      <a href="#main" data-i18n="footer.top">Top</a>
    </footer>
  `;
}

function applyI18n() {
  document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
  document.querySelectorAll("[data-i18n]").forEach((node) => {
    const key = node.getAttribute("data-i18n");
    if (key && I18N[lang][key]) {
      node.textContent = I18N[lang][key];
    }
  });
  const langToggle = document.getElementById(langToggleId);
  if (langToggle) {
    langToggle.textContent = lang === "zh" ? "EN" : "中文";
    langToggle.setAttribute("aria-pressed", String(lang === "en"));
  }
  updateThemeToggle();
  renderGallery();
  renderAwards();
  renderStages();
  renderProjects();
  renderProductReferences();
  document.querySelectorAll("a[href$='.html'], a[href*='.html?']").forEach((link) => {
    const url = new URL(link.href);
    if (url.origin !== window.location.origin) {
      return;
    }
    if (document.documentElement.dataset.profileEmbedded === "true") {
      url.searchParams.set("embed", "1");
    }
    if (lang === "en") {
      url.searchParams.set("lang", "en");
    } else {
      url.searchParams.delete("lang");
    }
    link.href = `${url.pathname.split("/").pop() || "index.html"}${url.search}${url.hash}`;
  });
}

function renderGallery() {
  const root = document.getElementById("gallery");
  if (!root) {
    return;
  }
  root.replaceChildren(
    ...GALLERY.map((item) => {
      const article = document.createElement("article");
      const media = document.createElement("div");
      media.className = "media";
      const img = document.createElement("img");
      img.src = item.img;
      img.alt = item.title[lang];
      img.loading = "lazy";
      const disclosure = document.createElement("span");
      disclosure.className = "media-disclosure";
      disclosure.textContent = I18N[lang]["media.illustration"];
      media.append(img, disclosure);
      const copy = document.createElement("div");
      copy.className = "copy";
      const tag = document.createElement("p");
      tag.className = "tag";
      tag.textContent = item.tag[lang];
      const h3 = document.createElement("h3");
      h3.textContent = item.title[lang];
      const p = document.createElement("p");
      p.textContent = item.body[lang];
      copy.append(tag, h3, p);
      article.append(media, copy);
      return article;
    }),
  );
}

function renderAwards() {
  const root = document.getElementById("award-gallery");
  if (!root) {
    return;
  }
  root.replaceChildren(
    ...AWARD_CARDS.map((item) => {
      const article = document.createElement("article");
      const bg = document.createElement("img");
      bg.className = "bg";
      bg.src = item.img;
      bg.alt = "";
      bg.loading = "lazy";
      const disclosure = document.createElement("span");
      disclosure.className = "media-disclosure";
      disclosure.textContent = I18N[lang]["media.illustration"];
      const shade = document.createElement("div");
      shade.className = "shade";
      const copy = document.createElement("div");
      copy.className = "copy";
      const year = document.createElement("div");
      year.className = "year";
      year.textContent = item.year;
      const h3 = document.createElement("h3");
      h3.textContent = item.title[lang];
      const p = document.createElement("p");
      p.textContent = item.body[lang];
      copy.append(year, h3, p);
      article.append(bg, shade, disclosure, copy);
      return article;
    }),
  );
}

function createInstitutionLogo(item) {
  const logoWrap = document.createElement("div");
  logoWrap.className = "institution-logo";
  const logo = document.createElement("img");
  logo.src = item.logo;
  logo.alt = item.logoAlt;
  logo.loading = "lazy";
  const fallback = document.createElement("span");
  fallback.className = "logo-fallback";
  fallback.textContent = item.logoAlt;
  logo.addEventListener("error", () => logoWrap.classList.add("load-failed"));
  logoWrap.append(logo, fallback);
  return logoWrap;
}

function createStageProject(project) {
  const article = document.createElement("article");
  article.className = "stage-project";

  const meta = document.createElement("p");
  meta.className = "stage-project-meta";
  const projectWhen = typeof project.when === "string" ? project.when : project.when[lang];
  meta.textContent = `${projectWhen} · ${project.role[lang]}`;
  const title = document.createElement("h4");
  title.textContent = project.title[lang];
  const body = document.createElement("p");
  body.textContent = project.body[lang];
  const tags = document.createElement("div");
  tags.className = "stage-tags";
  project.tags.forEach((tagText) => {
    const tag = document.createElement("span");
    tag.textContent = tagText;
    tags.append(tag);
  });
  article.append(meta, title, body, tags);
  if (project.metric) {
    const metric = document.createElement("div");
    metric.className = "stage-metric";
    metric.textContent = project.metric[lang];
    article.append(metric);
  }

  if (project.media?.length) {
    const media = document.createElement("div");
    media.className = "student-media";
    if (project.media.length === 1) {
      media.classList.add("single-media");
    }
    project.media.forEach((asset) => {
      const figure = document.createElement("figure");
      const img = document.createElement("img");
      img.src = asset.src;
      img.alt = asset.alt[lang];
      img.loading = "lazy";
      figure.append(img);
      media.append(figure);
    });
    const source = document.createElement("a");
    source.className = "source-link";
    source.href = project.mediaSource?.url
      ?? "https://github.com/caesarvan/NUS_Medical_Care";
    source.rel = "noopener noreferrer";
    source.target = "_blank";
    source.textContent = project.mediaSource?.label[lang]
      ?? I18N[lang]["stage.mediaSource"];
    article.append(media, source);
  }
  return article;
}

function renderStages() {
  const root = document.getElementById("stages");
  const nav = document.getElementById("stage-nav");
  if (!root || !nav) {
    return;
  }
  const requestedStageId = window.location.hash.replace("#stage-", "");

  nav.replaceChildren(
    ...STAGES.map((stage) => {
      const marker = document.createElement("span");
      marker.dataset.stageTarget = stage.id;
      marker.style.setProperty("--stage-accent", stage.accent);
      marker.textContent = `${stage.phase[lang]} · ${stage.when[lang]}`;
      return marker;
    }),
  );

  const sections = STAGES.map((stage, index) => {
      const section = document.createElement("section");
      section.className = "stage-section";
      section.id = `stage-${stage.id}`;
      section.dataset.stage = stage.id;
      if (stage.companyGroup) {
        section.dataset.company = "huawei";
      }
      section.dataset.index = String(index + 1).padStart(2, "0");
      section.style.setProperty("--stage-accent", stage.accent);
      section.style.setProperty("--stage-secondary", stage.secondary);
      section.addEventListener("pointermove", (event) => {
        const bounds = section.getBoundingClientRect();
        section.style.setProperty("--stage-x", `${((event.clientX - bounds.left) / bounds.width) * 100}%`);
        section.style.setProperty("--stage-y", `${((event.clientY - bounds.top) / bounds.height) * 100}%`);
      });
      const timelineNode = document.createElement("span");
      timelineNode.className = "timeline-node";
      timelineNode.setAttribute("aria-hidden", "true");
      const header = document.createElement("header");
      header.className = "stage-header";
      const logoWrap = createInstitutionLogo(stage);
      const heading = document.createElement("div");
      if (stage.companyGroup) {
        const company = document.createElement("p");
        company.className = "company-group-label";
        company.textContent = stage.companyGroup[lang];
        heading.append(company);
      }
      const phase = document.createElement("p");
      phase.className = "stage-phase";
      phase.textContent = `${stage.phase[lang]} · ${stage.when[lang]}`;
      const title = document.createElement("h3");
      title.textContent = stage.title[lang];
      const summary = document.createElement("p");
      summary.textContent = stage.summary[lang];
      const skills = document.createElement("div");
      skills.className = "stage-skill-line";
      stage.skills.forEach((skillText) => {
        const skill = document.createElement("span");
        skill.textContent = skillText;
        skills.append(skill);
      });
      heading.append(phase, title, summary, skills);
      header.append(logoWrap, heading);
      section.append(timelineNode, header);

      if (stage.projects.length) {
        const subhead = document.createElement("h3");
        subhead.className = "stage-subhead";
        subhead.textContent = I18N[lang]["stage.projects"];
        const projects = document.createElement("div");
        projects.className = "stage-projects";
        projects.append(...stage.projects.map(createStageProject));
        section.append(subhead, projects);
      }

      if (stage.awards?.[lang]?.length) {
        const subhead = document.createElement("h3");
        subhead.className = "stage-subhead";
        subhead.textContent = I18N[lang]["stage.awards"];
        const awards = document.createElement("ul");
        awards.className = "stage-awards";
        stage.awards[lang].forEach((awardText) => {
          const award = document.createElement("li");
          award.textContent = awardText;
          awards.append(award);
        });
        section.append(subhead, awards);
      }

      if (stage.link) {
        const link = document.createElement("a");
        link.className = "stage-link";
        link.href = stage.link;
        link.textContent = `${I18N[lang]["stage.careerLink"]} →`;
        section.append(link);
      }
      return section;
    });

  root.replaceChildren(...sections);
  if (!STAGES.some((stage) => stage.id === activeStageId)) {
    activeStageId = STAGES[0].id;
  }
  setupStageScrolling();
  if (pageName() !== "home" || window.location.hash.startsWith("#stage-")) {
    updateStageTheme(activeStageId);
  }
  const deepLink = requestedStageId
    ? document.getElementById(`stage-${requestedStageId}`)
    : null;
  if (deepLink) {
    requestAnimationFrame(() => deepLink.scrollIntoView({ block: "start" }));
  }
}

function updateStageTheme(stageId) {
  const stage = STAGES.find((item) => item.id === stageId);
  if (!stage) {
    return;
  }
  activeStageId = stage.id;
  const navLinks = document.querySelectorAll("[data-stage-target]");
  navLinks.forEach((link) => {
    const selected = link.dataset.stageTarget === stage.id;
    link.classList.toggle("active", selected);
    link.setAttribute("aria-current", selected ? "step" : "false");
    if (selected) {
      const rail = link.parentElement;
      rail?.scrollTo({
        left: link.offsetLeft - (rail.clientWidth - link.clientWidth) / 2,
        behavior: reduceMotion ? "auto" : "smooth",
      });
    }
  });

  document.documentElement.style.setProperty("--journey-accent", stage.accent);
  document.documentElement.style.setProperty("--journey-secondary", stage.secondary);
  document.body.dataset.journeyStage = stage.id;
  if (pageName() === "home") {
    setPrimaryNav("timeline");
  }

}

function setPrimaryNav(activeId) {
  document.querySelectorAll("[data-nav-id]").forEach((link) => {
    const selected = link.dataset.navId === activeId;
    link.classList.toggle("active", selected);
    if (selected) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });
}

function setupStageScrolling() {
  const sections = [...document.querySelectorAll(".stage-section")];
  if (!sections.length) {
    return;
  }
  if (stageScrollHandler) {
    window.removeEventListener("scroll", stageScrollHandler);
  }
  stageRevealObserver?.disconnect();

  let ticking = false;
  stageScrollHandler = () => {
    if (ticking) {
      return;
    }
    ticking = true;
    requestAnimationFrame(() => {
      const firstRect = sections[0].getBoundingClientRect();
      if (firstRect.top > window.innerHeight * 0.8) {
        if (pageName() === "home") {
          setPrimaryNav("home");
        }
        ticking = false;
        return;
      }
      const targetY = window.innerHeight * 0.42;
      const closest = sections.reduce((best, section) => {
        const rect = section.getBoundingClientRect();
        const visiblePoint = Math.max(rect.top, Math.min(targetY, rect.bottom));
        const distance = Math.abs(visiblePoint - targetY);
        return !best || distance < best.distance ? { section, distance } : best;
      }, null);
      if (closest) {
        updateStageTheme(closest.section.dataset.stage);
      }
      ticking = false;
    });
  };
  window.addEventListener("scroll", stageScrollHandler, { passive: true });

  stageRevealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("stage-visible");
        }
      });
    },
    { threshold: 0.02, rootMargin: "0px 0px -8% 0px" },
  );
  sections.forEach((section) => stageRevealObserver.observe(section));
  sections[0].classList.add("stage-visible");
  stageScrollHandler();
}

function renderProductReferences() {
  const root = document.getElementById("product-references");
  if (!root) {
    return;
  }
  root.replaceChildren(
    ...PRODUCT_REFERENCES.map((item) => {
      const article = document.createElement("article");
      const media = document.createElement("div");
      media.className = "media";
      const img = document.createElement("img");
      img.src = item.img;
      img.alt = item.title[lang];
      img.loading = "lazy";
      img.referrerPolicy = "no-referrer";
      const fallback = document.createElement("span");
      fallback.className = "photo-fallback";
      fallback.textContent = item.title[lang];
      img.addEventListener("error", () => media.classList.add("load-failed"));
      media.append(img, fallback);

      const copy = document.createElement("div");
      copy.className = "copy";
      const h3 = document.createElement("h3");
      h3.textContent = item.title[lang];
      const p = document.createElement("p");
      p.textContent = item.body[lang];
      const source = document.createElement("a");
      source.className = "source-link";
      source.href = item.sourceUrl;
      source.rel = "noopener noreferrer";
      source.target = "_blank";
      source.textContent = item.source[lang];
      copy.append(h3, p, source);
      article.append(media, copy);
      return article;
    }),
  );
}

function renderProjects() {
  const root = document.getElementById("project-list");
  if (!root) {
    return;
  }
  root.replaceChildren(
    ...PROJECTS.map((item) => {
      const a = document.createElement("a");
      a.className = "project-card";
      a.href = item.url;
      a.rel = "noopener noreferrer";
      a.target = "_blank";
      const meta = document.createElement("div");
      meta.className = "project-meta";
      meta.innerHTML = `<span>${item.name}</span><span>${item.lang}</span>`;
      const h3 = document.createElement("h3");
      h3.textContent = item.title[lang];
      const p = document.createElement("p");
      p.textContent = item.body[lang];
      a.append(meta, h3, p);
      return a;
    }),
  );
}

function sizeDieCanvas() {
  const dieCanvas = document.getElementById("die-canvas");
  if (!dieCanvas) {
    return;
  }
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const css = Math.min(window.innerWidth * 0.72, 720);
  dieCanvas.style.width = `${css}px`;
  dieCanvas.style.height = `${css}px`;
  dieCanvas.width = Math.floor(css * dpr);
  dieCanvas.height = Math.floor(css * dpr);
}

function drawDie(time) {
  const dieCanvas = document.getElementById("die-canvas");
  if (!dieCanvas) {
    return;
  }
  const ctx = dieCanvas.getContext("2d");
  if (!ctx) {
    return;
  }
  const { width, height } = dieCanvas;
  ctx.clearRect(0, 0, width, height);
  const cols = 14;
  const rows = 14;
  const pad = width * 0.08;
  const cellW = (width - pad * 2) / cols;
  const cellH = (height - pad * 2) / rows;
  const tSec = time * 0.001;

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const px = pad + x * cellW;
      const py = pad + y * cellH;
      const wave = Math.sin(x * 0.55 + y * 0.35 + tSec * 1.4);
      const edge = Math.hypot(x - cols / 2, y - rows / 2) / (cols / 2);
      if (edge > 1.05) {
        continue;
      }
      const alpha = 0.08 + Math.max(0, wave) * 0.22 * (1 - edge * 0.45);
      ctx.fillStyle = `rgba(118, 185, 0, ${alpha})`;
      ctx.fillRect(px + 2, py + 2, cellW - 4, cellH - 4);
      if ((x + y) % 5 === 0) {
        ctx.strokeStyle = `rgba(184, 255, 66, ${0.12 + Math.max(0, wave) * 0.2})`;
        ctx.strokeRect(px + 3, py + 3, cellW - 6, cellH - 6);
      }
    }
  }

  ctx.strokeStyle = "rgba(118, 185, 0, 0.4)";
  ctx.lineWidth = 2;
  const scanY = pad + ((tSec * 80) % (height - pad * 2));
  ctx.beginPath();
  ctx.moveTo(pad, scanY);
  ctx.lineTo(width - pad, scanY);
  ctx.stroke();
}

function sizeTelemetryCanvas() {
  const canvas = document.getElementById("telemetry-canvas");
  if (!canvas) {
    return;
  }
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const bounds = canvas.getBoundingClientRect();
  canvas.width = Math.floor(bounds.width * dpr);
  canvas.height = Math.floor(bounds.height * dpr);
}

function drawTelemetry(time) {
  const canvas = document.getElementById("telemetry-canvas");
  if (!canvas) {
    return;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }
  const { width, height } = canvas;
  const t = time * 0.001;
  ctx.clearRect(0, 0, width, height);

  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 1;
  for (let y = 0; y <= 4; y += 1) {
    const py = (height / 4) * y;
    ctx.beginPath();
    ctx.moveTo(0, py);
    ctx.lineTo(width, py);
    ctx.stroke();
  }

  const points = [];
  for (let i = 0; i <= 120; i += 1) {
    const x = (i / 120) * width;
    const base = height * 0.55;
    const wave = Math.sin(i * 0.12 + t * 2.2) * height * 0.1
      + Math.sin(i * 0.035 + t * 0.8) * height * 0.16;
    const pulse = Math.max(0, Math.sin(i * 0.02 + t * 1.3)) * height * 0.08;
    points.push([x, base - wave - pulse]);
  }

  ctx.beginPath();
  points.forEach(([x, y], index) => {
    if (index === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });
  ctx.lineTo(width, height);
  ctx.lineTo(0, height);
  ctx.closePath();
  const fill = ctx.createLinearGradient(0, 0, 0, height);
  fill.addColorStop(0, "rgba(118,185,0,0.32)");
  fill.addColorStop(1, "rgba(118,185,0,0.01)");
  ctx.fillStyle = fill;
  ctx.fill();

  ctx.beginPath();
  points.forEach(([x, y], index) => {
    if (index === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });
  ctx.strokeStyle = "#76b900";
  ctx.lineWidth = Math.max(2, width * 0.005);
  ctx.shadowColor = "rgba(118,185,0,0.65)";
  ctx.shadowBlur = 14;
  ctx.stroke();
  ctx.shadowBlur = 0;

  const cursorX = ((t * 90) % width);
  ctx.strokeStyle = "rgba(255,255,255,0.28)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cursorX, 0);
  ctx.lineTo(cursorX, height);
  ctx.stroke();
}

function loopTelemetry(time) {
  drawTelemetry(time);
  if (!reduceMotion) {
    telemetryAnim = requestAnimationFrame(loopTelemetry);
  }
}

function setupReveal() {
  const nodes = document.querySelectorAll(".reveal");
  if (!("IntersectionObserver" in window)) {
    nodes.forEach((node) => node.classList.add("visible"));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          io.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: "0px 0px -40px 0px" },
  );
  nodes.forEach((node) => io.observe(node));
}

function updateProgress() {
  const el = document.getElementById("scroll-progress");
  if (!el) {
    return;
  }
  const max = document.documentElement.scrollHeight - window.innerHeight;
  el.style.width = `${max > 0 ? (window.scrollY / max) * 100 : 0}%`;
}

function bindChrome() {
  const themeToggle = document.getElementById(themeToggleId);
  themeToggle?.addEventListener("click", () => {
    setTheme(resolvedTheme() === "dark" ? "light" : "dark", true);
  });

  const langToggle = document.getElementById(langToggleId);
  const menuToggle = document.getElementById(menuToggleId);
  const mobileNav = document.getElementById(mobileNavId);

  langToggle?.addEventListener("click", () => {
    lang = lang === "zh" ? "en" : "zh";
    localStorage.setItem("site-lang", lang);
    const url = new URL(window.location.href);
    if (lang === "en") {
      url.searchParams.set("lang", "en");
    } else {
      url.searchParams.delete("lang");
    }
    window.history.replaceState({}, "", url);
    applyI18n();
  });

  menuToggle?.addEventListener("click", () => {
    const open = mobileNav.hasAttribute("hidden");
    if (open) {
      mobileNav.removeAttribute("hidden");
    } else {
      mobileNav.setAttribute("hidden", "");
    }
    menuToggle.setAttribute("aria-expanded", String(open));
  });

  mobileNav?.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      mobileNav.setAttribute("hidden", "");
      menuToggle.setAttribute("aria-expanded", "false");
    });
  });
}

renderChrome();
applyI18n();
bindChrome();
setupReveal();
updateProgress();
window.addEventListener("scroll", updateProgress, { passive: true });
window.addEventListener("resize", () => {
  sizeDieCanvas();
  sizeTelemetryCanvas();
});
themeMedia.addEventListener("change", (event) => {
  if (!localStorage.getItem("color-theme")) {
    setTheme(event.matches ? "dark" : "light", false);
  }
});
document.addEventListener("pointermove", (event) => {
  const glass = event.target.closest(
    ".link-card, .project-card, .gallery article, .stage-project, .stage-section, .plain-section, .note-box",
  );
  if (!glass) {
    return;
  }
  const bounds = glass.getBoundingClientRect();
  glass.style.setProperty("--glass-x", `${event.clientX - bounds.left}px`);
  glass.style.setProperty("--glass-y", `${event.clientY - bounds.top}px`);
});
window.addEventListener("hashchange", () => {
  const stageId = window.location.hash.replace("#stage-", "");
  const stage = document.getElementById(`stage-${stageId}`);
  if (stage) {
    stage.scrollIntoView({ block: "start" });
  }
});

sizeDieCanvas();
sizeTelemetryCanvas();
function loopDie(time) {
  drawDie(time);
  if (!reduceMotion) {
    dieAnim = requestAnimationFrame(loopDie);
  }
}
if (document.getElementById("die-canvas")) {
  dieAnim = requestAnimationFrame(loopDie);
}
if (document.getElementById("telemetry-canvas")) {
  telemetryAnim = requestAnimationFrame(loopTelemetry);
}
