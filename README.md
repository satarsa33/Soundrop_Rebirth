# Soundrop Rebirth — PWA

Gioco musicale di geometria, pronto per essere ospitato come sito web e
installato sulla schermata Home di iPhone/iPad tramite Safari.

## Struttura del progetto

```
index.html      pagina principale + markup dei pannelli (menu, tempo dropper)
style.css       interfaccia in stile iOS (vetro smerigliato, bottom sheet)
game.js         input, rendering, droppers, salvataggi, collegamento UI
physics.js      motore fisico (palline, strumenti a linea, collisioni)
audio.js        sintesi audio degli strumenti (Web Audio API)
manifest.json   metadati PWA
sw.js           service worker (funzionamento offline dopo la prima visita)
icons/          icone dell'app (generate con make_icons.py)
make_icons.py   script Python usato per generare le icone (facoltativo)
```

## 1. Come ospitarlo

Serve semplicemente un hosting statico con **HTTPS** (obbligatorio: Safari
richiede la connessione sicura per service worker e Web Audio in un contesto
PWA). Alcune opzioni gratuite/veloci:

- **GitHub Pages**: crea un repository, carica questi file nella root (o in
  `/docs`), attiva Pages nelle impostazioni del repository.
- **Netlify / Vercel**: trascina la cartella del progetto nella dashboard, o
  collega il repository Git — il deploy è automatico.
- **Server ACI esistente**: se hai già uno spazio web aziendale, basta
  caricare questi file via FTP/SFTP in una cartella dedicata.

Non serve alcun passaggio di build: sono file statici, si caricano così come
sono.

## 2. Aggiungere l'app alla schermata Home (iPhone/iPad)

1. Apri l'URL del sito con **Safari** (non Chrome: su iOS solo Safari
   permette l'installazione PWA con tutte le funzionalità).
2. Tocca l'icona di condivisione (il quadrato con la freccia verso l'alto).
3. Scorri e seleziona **"Aggiungi a Home"**.
4. Conferma il nome (Soundrop) e tocca **Aggiungi**.

Da quel momento l'icona sulla Home aprirà l'app a schermo intero, senza la
barra di Safari, con l'icona personalizzata generata nel progetto.

## 3. Limiti noti su iOS di cui tenere conto

- **Audio**: iOS richiede un tocco dell'utente prima di avviare l'audio; il
  gioco richiama `audio.ensureContext()` al primo tocco sul campo da gioco,
  quindi funziona correttamente ma non partirà da solo al caricamento.
- **Salvataggi (localStorage)**: Safari può cancellare i dati di siti/PWA
  poco usati dopo un lungo periodo di inattività (regola "ITP" di Apple).
  Per un uso occasionale va benissimo; se in futuro serve persistenza
  garantita, il passo successivo è aggiungere un piccolo backend (o iCloud
  key-value storage tramite un'app nativa).
- **Gravità reale**: usa l'accelerometro (`DeviceMotionEvent`), che su iOS
  richiede un permesso esplicito concesso con un tocco — è già gestito nel
  pannello Fisica quando si passa a "Gravità reale".

## 4. Personalizzare velocemente

- **Colori/strumenti**: modifica l'array `COLOR_SLOTS` in `game.js` per
  cambiare i colori disponibili o gli strumenti di default.
- **Nuovi timbri**: aggiungi una nuova voce all'oggetto `INSTRUMENTS` in
  `audio.js` (bastano oscillatori/filtri Web Audio, nessuna libreria esterna).
- **Icona**: modifica `make_icons.py` e rilancia `python3 make_icons.py`
  per rigenerare le icone in `icons/`.

## 5. Test rapido in locale

Prima di pubblicare, puoi provarlo su Mac con un server statico qualsiasi,
ad esempio dal terminale, nella cartella del progetto:

```
python3 -m http.server 8000
```

poi apri `http://localhost:8000` da Safari sul Mac, oppure dal Safari di
iPhone puntando all'indirizzo IP del Mac sulla stessa rete Wi-Fi (il
service worker e "Aggiungi a Home" completi richiedono comunque HTTPS,
quindi per il test finale pre-lancio conviene già pubblicare su
GitHub Pages/Netlify, che sono gratuiti e istantanei).
