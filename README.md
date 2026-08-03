# Költség app

Személyes költségkövető (telóra). Az adatok a telefonodon tárolódnak, nincs fiók, ingyen.

**Élő link:** https://redythecat.github.io/koltseg-2e20b4/

## Telepítés a telóra
1. Nyisd meg a linket (https://redythecat.github.io/koltseg-2e20b4/) a telefon böngészőjében.
2. Menü → „Hozzáadás a kezdőképernyőhöz".
3. Ezután a kezdőképernyőről indul, offline is megy.

## Blokk beolvasása
1. A Claude appban fényképezd le a blokkot, kérd az import-kódot.
2. Az appban: Beállítások → Blokk import → illeszd be a kódot → Beolvasás → nézd át → Hozzáadás.

## Kötelező kiadások, emlékeztetők
- Beállítások → Kötelező kiadások: vedd fel a rendszereseket (törlesztő, TB, hitel).
- Ismétlődés (napi/heti/havi) + lejárat állítható.
- „Naptárba": a telefonod saját naptárába teszi, ismétlődéssel és riasztással (zárt appnál is szól).
- „Kifizetve": kipipálod, ha rendezted (opcionálisan kimenő utalást is rögzít).

## Utalások és áttekintő
- Utalások fül: bejövő/kimenő banki tételek.
- Áttekintő fül: bevétel / kiadás / egyenleg, kategória-bontás, készpénz vs kártya.

## Mentés
- Beállítások → Export: Excelben nyitható CSV (ez a hónap vagy minden).
- Beállítások → Backup mentése: teljes mentés egy fájlba (telócsere ellen). Visszatöltés ugyanitt.

## Téma
- Beállítások → Téma: sötét / világos / rendszer szerint.

---

## Fejlesztőknek

- Statikus PWA, build-lépés nélkül (vanilla JS, ES module-ok).
- Tesztek: `npm test` (Node beépített teszt-futtató). A tiszta üzleti logika (`src/model.js`,
  `src/codec.js`, `src/csv.js`, `src/ics.js`) tesztelt.
- Helyi futtatás: `python3 -m http.server 8000`, majd `http://localhost:8000`.
- Terv és specifikáció: `docs/superpowers/`.
