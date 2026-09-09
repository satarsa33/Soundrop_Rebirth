# Campioni audio personalizzati

Metti qui i tuoi file audio (`.mp3`, `.wav` o `.ogg`) e descrivili nel file
`samples.json` di questa cartella. All'avvio, Soundrop Rebirth carica questo
elenco e aggiunge automaticamente ogni campione come opzione selezionabile
nel menu "Strumenti per colore", accanto a quelli sintetizzati (Marimba,
Synth, Bell, Pluck, Drum).

## Formato di `samples.json`

Un array di oggetti, uno per campione:

```json
[
  {
    "id": "vibrafono",
    "label": "Vibrafono",
    "file": "vibrafono.mp3",
    "baseFrequency": 261.63,
    "gain": 1
  }
]
```

- **id**: identificatore interno, univoco, senza spazi.
- **label**: nome mostrato nel menu (es. "Vibrafono").
- **file**: nome del file audio, che deve trovarsi in questa stessa cartella
  `samples/`.
- **baseFrequency** *(opzionale, default 261.63 = Do centrale)*: la nota
  fondamentale del tuo campione, in Hz. Serve per calcolare di quanto
  velocizzare/rallentare la riproduzione (pitch-shift) in base alla velocità
  della pallina. Se il campione è, ad esempio, un La a 440Hz, indica 440.
- **gain** *(opzionale, default 1)*: moltiplicatore di volume per bilanciare
  campioni registrati a livelli diversi.

## Consigli per i file audio

- **Durata breve** (idealmente sotto 1-2 secondi): il gioco può generare
  collisioni molto ravvicinate, quindi campioni tipo "colpo secco" (una nota
  pizzicata, una percussione, un tocco di marimba) funzionano meglio di suoni
  lunghi con coda di riverbero infinita.
- **Formato**: mp3 o ogg per file più leggeri (utile per il caricamento su
  rete mobile); wav se vuoi la qualità massima senza compressione.
- **Mono** è preferibile a stereo: pesa meno e nel gioco non c'è comunque
  posizionamento stereo dei suoni.
- Il pitch-shift è limitato a un range di circa 0.5x–2.2x rispetto
  all'originale per evitare effetti "voce di Paperino" troppo estremi:
  scegli un `baseFrequency` vicino al registro medio del tuo campione per un
  risultato più naturale su tutta la gamma di velocità.

## Diritti d'uso

Usa solo campioni che hai registrato tu stesso oppure di cui hai i diritti
d'uso (librerie royalty-free acquistate, contenuti a licenza CC0, ecc.). Non
includere file protetti da copyright senza autorizzazione, specialmente se
l'app verrà mostrata o distribuita a colleghi/pubblico.
