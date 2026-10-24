// In-page overlay drawn on top of the app while recording: Hebrew captions,
// tap ripples, a highlight ring and title/end cards. It lives in a closed
// shadow root so the app's styles can't touch it and it can't touch the app.

export const OVERLAY_SCRIPT = `
(() => {
  if (window.__tut) return;
  const css = \`
    :host { all: initial; }
    .layer { position: fixed; inset: 0; pointer-events: none; z-index: 2147483647;
      font-family: Heebo, system-ui, sans-serif; direction: rtl; }
    .cap { position: absolute; left: 14px; right: 14px; bottom: 104px; display: flex; justify-content: center;
      opacity: 0; transform: translateY(10px); transition: opacity .28s ease, transform .28s cubic-bezier(.2,.8,.2,1); }
    .cap.on { opacity: 1; transform: none; }
    .cap.top { bottom: auto; top: 18px; transform: translateY(-10px); }
    .cap.top.on { transform: none; }
    .cap span { background: rgba(17, 22, 32, .92); color: #fff; font-size: 17px; line-height: 1.45; font-weight: 600;
      padding: 11px 16px; border-radius: 14px; box-shadow: 0 10px 30px rgba(0,0,0,.28); text-align: center;
      max-width: 100%; }
    .tap { position: absolute; width: 46px; height: 46px; margin: -23px 0 0 -23px; border-radius: 50%;
      background: rgba(255, 196, 0, .45); border: 3px solid rgba(255, 196, 0, .95);
      animation: tap .7s ease-out forwards; }
    @keyframes tap { 0% { transform: scale(.4); opacity: 1; } 60% { transform: scale(1); opacity: .9; }
      100% { transform: scale(1.5); opacity: 0; } }
    .ring { position: absolute; border-radius: 14px; border: 3px solid #ffc400;
      box-shadow: 0 0 0 9999px rgba(10, 14, 22, .38); opacity: 0; transition: opacity .3s ease; }
    .ring.on { opacity: 1; }
    .card { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center;
      gap: 14px; padding: 32px; text-align: center; background: #151c28; color: #fff;
      opacity: 0; transition: opacity .4s ease; }
    .card.on { opacity: 1; }
    .card h1 { margin: 0; font-size: 30px; line-height: 1.25; font-weight: 800; letter-spacing: -.01em; }
    .card p { margin: 0; font-size: 17px; line-height: 1.5; color: rgba(255,255,255,.78); max-width: 300px; }
  \`;
  function mount() {
    const host = document.createElement("div");
    host.id = "__tut_host";
    const root = host.attachShadow({ mode: "closed" });
    root.innerHTML = '<style>' + css + '</style><div class="layer"><div class="ring"></div><div class="cap"><span></span></div><div class="card"></div></div>';
    document.documentElement.appendChild(host);
    return root;
  }
  let root = null;
  const get = () => {
    if (!root || !document.getElementById("__tut_host")) root = mount();
    return root;
  };
  // A sheet or modal is open: keep the caption out of its way, at the top.
  function placeCaption() {
    if (!root) return;
    const sheet = [...document.querySelectorAll(".modal-card, [aria-modal='true']")].some((el) => {
      const r = el.getBoundingClientRect();
      return r.height > 0 && r.bottom > innerHeight * 0.55 && getComputedStyle(el).visibility !== "hidden";
    });
    root.querySelector(".cap").classList.toggle("top", sheet);
  }
  setInterval(placeCaption, 150);
  window.__tut = {
    caption(text) {
      const r = get();
      const cap = r.querySelector(".cap");
      if (!text) { cap.classList.remove("on"); return; }
      const span = cap.querySelector("span");
      placeCaption();
      if (cap.classList.contains("on") && span.textContent !== text) {
        cap.classList.remove("on");
        setTimeout(() => { span.textContent = text; cap.classList.add("on"); }, 180);
      } else { span.textContent = text; cap.classList.add("on"); }
    },
    tap(x, y) {
      const el = document.createElement("div");
      el.className = "tap";
      el.style.left = x + "px";
      el.style.top = y + "px";
      get().querySelector(".layer").appendChild(el);
      setTimeout(() => el.remove(), 800);
    },
    ring(box) {
      const ring = get().querySelector(".ring");
      if (!box) { ring.classList.remove("on"); return; }
      const pad = 6;
      Object.assign(ring.style, { left: box.x - pad + "px", top: box.y - pad + "px", width: box.width + pad * 2 + "px", height: box.height + pad * 2 + "px" });
      ring.classList.add("on");
    },
    title(title, subtitle) {
      const card = get().querySelector(".card");
      if (!title) { card.classList.remove("on"); return; }
      card.innerHTML = '<h1></h1><p></p>';
      card.querySelector("h1").textContent = title;
      card.querySelector("p").textContent = subtitle || "";
      card.classList.add("on");
    },
  };
})();
`;
