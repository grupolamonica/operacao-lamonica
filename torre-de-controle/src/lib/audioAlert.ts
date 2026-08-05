// Motor de áudio compartilhado (beep + voz) — extraído de ControleOperacionalPage
// (era local àquela página; agora reusado também por BaixaManifestoPage).
//
// AudioContext único e reaproveitado. Navegadores bloqueiam áudio até um gesto do
// usuário (autoplay policy) — por isso unlockAudio() é chamado no 1º clique da página
// e ao ligar o som; beep() faz resume() antes de tocar caso esteja suspenso.
let sharedCtx: AudioContext | null = null
export function getCtx(): AudioContext | null {
  const AC = (window as any).AudioContext || (window as any).webkitAudioContext
  if (!AC) return null
  if (!sharedCtx) {
    try { sharedCtx = new AC() } catch { return null }
  }
  return sharedCtx
}
export function unlockAudio() {
  const ctx = getCtx()
  if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {})
}
export async function beep(frequency = 880) {
  const ctx = getCtx()
  if (!ctx) return
  try {
    // ESSENCIAL: aguardar o resume() ANTES de agendar a nota. Sem o await, num
    // contexto recém-desbloqueado o oscilador era agendado enquanto ainda estava
    // 'suspended' → nenhum som saía (era o bug). Se não houver gesto prévio, o
    // resume() rejeita (autoplay policy) e cai no catch — sem erro.
    if (ctx.state !== 'running') await ctx.resume()
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.connect(g); g.connect(ctx.destination)
    o.type = 'sine'; o.frequency.value = frequency
    const t = ctx.currentTime
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.25, t + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4)
    o.start(t); o.stop(t + 0.42)
  } catch { /* autoplay ainda bloqueado (sem gesto prévio) */ }
}

// Voz (Web Speech / SpeechSynthesis) em pt-BR — fala a mensagem da movimentação.
export function speak(text: string) {
  try {
    const synth = window.speechSynthesis
    if (!synth) return
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'pt-BR'
    u.rate = 1.05
    const voices = synth.getVoices()
    const pt = voices.find((v) => /pt[-_]?br/i.test(v.lang)) || voices.find((v) => /^pt/i.test(v.lang))
    if (pt) u.voice = pt
    synth.speak(u)
  } catch { /* sem suporte a voz — ignora */ }
}

// Prime da voz no 1º gesto (carrega vozes + libera o autoplay).
export function primeSpeech() {
  try { window.speechSynthesis?.resume(); window.speechSynthesis?.getVoices() } catch { /* noop */ }
}
