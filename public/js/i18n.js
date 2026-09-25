// Translation. The English text is its own key, so anything not yet translated simply stays in English.
// The interface is translated as it's drawn: a watcher looks at new text and swaps in the translation.
// Anything inside [translate="no"] (city names, chat, guestbook notes) is left exactly as written.
import EL from './lang/el.js';

const LANGS = { en: { dict: {}, patterns: [] }, el: EL };
let lang = 'en', dict = {}, patterns = [];
// For each text node and attribute: the English original and the text we last put there. If the game has
// since written something else, that's a new English original.
const seen = new WeakMap();
const seenAttr = new WeakMap();
const ATTRS = ['title', 'placeholder', 'aria-label'];

export const languages = [['auto', 'Automatic'], ['en', 'English'], ['el', 'Ελληνικά']];
export const currentLang = () => lang;
export function pickLang(pref) {
  if (pref && pref !== 'auto' && LANGS[pref]) return pref;
  const nav = (navigator.languages || [navigator.language || 'en']).map((l) => String(l).slice(0, 2).toLowerCase());
  return nav.find((l) => LANGS[l]) || 'en';
}

export function t(s, vars) {
  if (s == null) return s;
  let out = dict[s];
  if (out === undefined && lang !== 'en') {
    for (const [re, rep] of patterns) { if (re.test(s)) { out = s.replace(re, rep); break; } }
  }
  if (out === undefined) out = s;
  if (vars) out = out.replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m));
  return out;
}

const skip = (el) => !el || el.closest?.('[translate="no"], script, style, svg, canvas, textarea, [contenteditable]');
function doText(node) {
  if (skip(node.parentElement)) return;
  const cur = node.nodeValue, rec = seen.get(node);
  const en = rec && cur === rec.set ? rec.en : cur;
  const core = en.trim();
  let next = en;
  if (core && !/^[\d\s$%+−,.:/-]+$/.test(core)) { const tr = t(core); if (tr !== core) next = en.replace(core, tr); }
  seen.set(node, { en, set: next });
  if (next !== cur) node.nodeValue = next;
}
function doAttrs(el) {
  if (skip(el)) return;
  let m = seenAttr.get(el);
  for (const a of ATTRS) {
    if (!el.hasAttribute(a)) continue;
    if (!m) { m = {}; seenAttr.set(el, m); }
    const cur = el.getAttribute(a), rec = m[a];
    const en = rec && cur === rec.set ? rec.en : cur, next = t(en);
    m[a] = { en, set: next };
    if (next !== cur) el.setAttribute(a, next);
  }
}
export function translateTree(root) {
  if (!root) return;
  if (root.nodeType === 3) { doText(root); return; }
  if (root.nodeType !== 1) return;
  doAttrs(root);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) { if (n.nodeType === 3) doText(n); else doAttrs(n); }
}

let observer = null, busy = false;
export function setLang(pref) {
  lang = pickLang(pref);
  ({ dict, patterns } = LANGS[lang]);
  document.documentElement.lang = lang;
  busy = true;
  translateTree(document.body);
  busy = false;
  if (!observer) {
    observer = new MutationObserver((list) => {
      if (busy) return;
      busy = true;
      try {
        for (const m of list) {
          if (m.type === 'characterData') doText(m.target);
          else if (m.type === 'attributes') doAttrs(m.target);
          else for (const n of m.addedNodes) translateTree(n);
        }
      } finally { busy = false; }
    });
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }
  return lang;
}
