/**
 * Voix et sons du guidage sur le web : synthèse vocale du navigateur (voix française)
 * et petits signaux sonores (Web Audio) pour les alertes. Coupable par le conducteur.
 */
const CLE = 'borneapp.voix'

export function voixActive(): boolean {
  try {
    return localStorage.getItem(CLE) !== 'off'
  } catch {
    return true
  }
}

export function activerVoix(active: boolean) {
  try {
    localStorage.setItem(CLE, active ? 'on' : 'off')
  } catch {
    // Préférence non mémorisée (navigation privée).
  }
  if (!active) window.speechSynthesis?.cancel()
}

let voixFr: SpeechSynthesisVoice | null = null
function choisirVoix() {
  const voix = window.speechSynthesis?.getVoices() ?? []
  voixFr = voix.find((v) => v.lang === 'fr-FR' && /amelie|thomas|google|audrey/i.test(v.name)) ?? voix.find((v) => v.lang.startsWith('fr')) ?? null
}
if (typeof window !== 'undefined' && window.speechSynthesis) {
  choisirVoix()
  window.speechSynthesis.onvoiceschanged = choisirVoix
}

/** Lit un texte à voix haute (les alertes passent avant les consignes en cours). */
export function parler(texte: string, prioritaire = false) {
  if (!voixActive() || !window.speechSynthesis) return
  if (prioritaire) window.speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(texte)
  u.lang = 'fr-FR'
  if (voixFr) u.voice = voixFr
  u.rate = 1.02
  window.speechSynthesis.speak(u)
}

let contexte: AudioContext | null = null
/** Signal sonore : « info » (deux notes montantes) ou « alerte » (trois bips graves). */
export function bip(type: 'info' | 'alerte') {
  if (!voixActive()) return
  try {
    contexte ??= new AudioContext()
    const notes = type === 'info' ? [660, 880] : [440, 440, 440]
    notes.forEach((f, i) => {
      const o = contexte!.createOscillator()
      const g = contexte!.createGain()
      const t = contexte!.currentTime + i * (type === 'info' ? 0.16 : 0.22)
      o.type = 'sine'
      o.frequency.value = f
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(0.25, t + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15)
      o.connect(g).connect(contexte!.destination)
      o.start(t)
      o.stop(t + 0.16)
    })
  } catch {
    // Audio indisponible (navigateur sans Web Audio) : l'alerte reste visuelle.
  }
}
