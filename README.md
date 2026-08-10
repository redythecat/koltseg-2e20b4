# Költség app

Személyes költségkövető (telóra). Az adatok a telefonodon tárolódnak, nincs fiók, ingyen.

**Élő link:** https://redythecat.github.io/koltseg-2e20b4/

## Telepítés a telóra
1. Nyisd meg a linket (https://redythecat.github.io/koltseg-2e20b4/) a telefon böngészőjében.
2. Menü → „Hozzáadás a kezdőképernyőhöz".
3. Ezután a kezdőképernyőről indul, offline is megy.

## Blokk bevitele
1. Az appban: Beállítások → Blokk bevitel → „Beolvasó szöveg másolása".
2. A Claude appban illeszd be a szöveget a blokk fotójával együtt. Válaszul egy JSON-t kapsz.
3. A JSON-t másold vissza az appba a beviteli mezőbe → Beolvasás → nézd át (kategória állítható,
   a tétel nevét hosszan nyomva javítható) → Hozzáadás a hónaphoz.

## Kötelező kiadások, emlékeztetők
- Beállítások → Kötelező kiadások: vedd fel a rendszereseket (törlesztő, TB, hitel), kártya vagy készpénz.
- Ismétlődés (egyszeri/napi/heti/havi) + lejárat állítható, az értesítés külön kapcsolható.
- „Naptárba": a telefonod saját naptárába teszi, ismétlődéssel és riasztással (zárt appnál is szól).
- „Kifizetve": kipipálod, ha rendezted — felajánlja, hogy kimenő pénzmozgásként is rögzítse
  (az így rögzített tételek magától kötelezőnek számítanak a statisztikában).

## Pénzmozgás és áttekintő
- Pénzmozgás fül: bejövő (fizetés, érkező utalás) és kimenő tételek; a kimenőnél jelölhető,
  hogy kötelező kiadás-e. Külön lista az átvezetéseknek (készpénzfelvétel, kártyára befizetés,
  csere valakivel) — ezek egyik összesítésbe sem számítanak bele.
- Áttekintő fül: bevétel / kiadás / egyenleg, összehasonlítás az előző hónappal, hó végi becslés,
  kategória-bontás, valamint Havi és Éves statisztika (összes / kötelező / egyéb / bolti, kp és kártya).

## Mentés
- A mentés magától megy: minden blokk-bevitel után letöltődik egy mentés-fájl (iPhone-on rákérdez),
  és rendszeres telefonos mentés is készül (2, 4 vagy 7 naponta — beállítható). Kézzel: Beállítások → „Biztonsági mentés fájlba".
  Visszatöltés: „Visszaállítás mentésből" (a telefonos mentések listája is itt van, a 7 napnál
  régebbiek egy gombbal törölhetők).
- Beállítások → Excel táblázat: .xlsx (ez a hónap vagy minden) — megnézésre/nyomtatásra,
  visszaállításra nem alkalmas.

## Kinézet
- Beállítások: sötét / világos / rendszer szerinti téma, kiemelő szín, betűméret.

## Kilépés
- A telefon Vissza gombját kétszer megnyomva (az első után figyelmeztető üzenet jelenik meg).

---

## Fejlesztőknek

- Statikus PWA, build-lépés nélkül (vanilla JS, ES module-ok).
- Tesztek: `npm test` (Node beépített teszt-futtató). A tiszta üzleti logika (`src/model.js`,
  `src/codec.js`, `src/xlsx.js`, `src/ics.js`) tesztelt.
- Helyi futtatás: `python3 -m http.server 8000`, majd `http://localhost:8000`.
- Terv és specifikáció: `docs/superpowers/`.
