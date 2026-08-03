# Költség — személyes költségkövető app (terv)

*Dátum: 2026-08-03*

## Cél

Egyszerű, telón használható költségkövető, amiben Ági (és opcionálisan a párja) havonta
vezeti a kiadásait kategóriánként. A fő elv: **minél kevesebb macera**. A blokkot
lefényképezi, és a tételek a megfelelő kategóriába kerülnek.

## Alapdöntések (jóváhagyva)

- **Eszköz:** telefon-first (Android), egyetlen eszköz. Nincs teló↔Mac szinkron.
- **Forma:** offline web-app (PWA), amit egy linkről nyit meg és a kezdőképernyőre tesz.
- **Tárolás:** minden adat a telón, a böngésző tárhelyén. Nincs fiók, nincs előfizetés, ingyen.
- **Blokk-beolvasás:** a fotó → tételek felismerést és kategorizálást Claude végzi a Claude
  appban; az eredmény egy **import-kód**, amit az appba beilleszt.
- **Claude-függetlenség:** az app minden funkciója Claude nélkül is működik; csak az AI-s
  blokk-beolvasás igényel Claude-fiókot (bármelyiket). Így a párja is használhatja előfiz nélkül.
- **UI:** nagyon átlátható, könnyen kezelhető, nagy célfelületek, kevés kattintás.
- **Téma:** sötét / világos / rendszer szerinti, kapcsolható a beállításokban.

## Adatmodell

```
Globális
 ├─ Kategóriák (Élelmiszer, Alkohol/üdítő, Tisztítószer, Macska, Luxus — szerkeszthető)
 ├─ Emlékeztetők (ismétlődő kötelező kiadások: név, esedékesség napja, opc. összeg)
 ├─ Beállítások (téma: sötét/világos/rendszer; értesítések be/ki)
 └─ Hónapok (pl. "2026-08")
     ├─ Tételek (kategóriánként)
     ├─ Utalások (bejövő/kimenő)
     └─ Kifizetett emlékeztetők (mely kötelező kiadás van kipipálva ebben a hónapban)
```

**Tétel mezői:**
- `név` (szöveg)
- `darabszám` (szám, alap: 1)
- `ár` (szám, HUF — az adott soré, azaz darabszám × egységár összege)
- `üzlet` (szöveg)
- `dátum` (nap; alap: mai vagy a blokk dátuma)
- `fizetési mód` (készpénz / kártya; a blokkról kiolvasva, kézzel is állítható)
- `kategória` (melyik kategóriában van; áthelyezhető)

**Megjegyzett tétel (gyorslista sablon):**
- `név`, tipikus `üzlet`, tipikus `kategória`, opcionális utolsó `ár`/`darabszám`.
- Minden felvett tételből automatikusan keletkezik/frissül egy sablon, hogy később
  a gyorslistából egy koppintással hozzáadható legyen.

**Kategória:**
- `név`, sorrend. Átnevezhető, hozzáadható, törölhető.
- Törléskor rákérdez: a benne lévő tételek mozgatása másik kategóriába, vagy törlése.

**Emlékeztető / kötelező kiadás (globális, ismétlődő — nem hónaphoz kötött):**
- `név` (pl. „Törlesztő", „TB", „Hitel")
- `összeg` (opcionális — árral vagy anélkül is lehet)
- `megjegyzés` (opcionális)
- `aktív` (be/ki)
- **Ismétlődés:** `freq` = napi / heti / havi, `interval` (alap 1, pl. „2 hetente"),
  `kezdő dátum`, opcionális `lejárati dátum`.
- `értesítés ideje` (opcionális, alap 9:00 — a naptár-riasztáshoz).
- Havi „kifizetve" állapot: a `hónap` tárolja, mely emlékeztetők vannak kipipálva
  (`paidReminders: [reminderId]`). „Kifizetve"-re jelöléskor opcionálisan létrehoz egy
  **kimenő utalást** az összeggel.
- **„Naptárba" gomb:** az app `.ics` naptár-fájlt készít (ismétlődés = RRULE, lejárat = UNTIL,
  riasztás = VALARM), amit a telefon az alapértelmezett naptárába tesz — begépelés nélkül,
  a naptár egyszeri „hozzáad" megerősítésével. A natív riasztás zárt appnál is szól.

**Utalás (banki tétel — a hónapon belül, a kiadás-kategóriáktól külön):**
- `irány` (bejövő / kimenő)
- `megnevezés` (pl. „Fizetés", „Albérlet", „Visszatérítés")
- `összeg` (HUF)
- `dátum`
- `partner` (kitől / kinek — opcionális)
- `megjegyzés` (opcionális)
- A visszatérő utalások itt is **megjegyzett sablonként** gyorslistáról hozzáadhatók.

## Fő nézetek / UI

### 1. Hónap-nézet (fő képernyő)
- Fent hónapváltó: `‹ 2026 augusztus ›`, „új hónap" lehetőség.
- Kategória-kártyák egymás alatt; mindegyik lenyitható:
  - a tételei (név, db, ár, üzlet, dátum),
  - a **kategória összege**.
- Legalul a **havi végösszeg**.

### 2. Tétel szerkesztése
- Tételre koppintva: mezők módosítása, **áthelyezés** másik kategóriába, törlés.

### 3. Hozzáadás (3 mód)
1. **Gyorslista** — a megjegyzett sablonok listája; koppintás → csak ár/db megerősítése.
2. **Kézi felvétel** — üres űrlap (név, db, ár, üzlet, dátum, kategória).
3. **Import (blokkból)** — „Import" gomb; ide illeszti be a Claude-tól kapott kódot.
   A tételek megjelennek egy előnézetben (kategóriákba sorolva), átnézi, majd véglegesíti.

### 4. Kategóriák kezelése
- Átnevezés / új / törlés (törléskor a tételek sorsáról rákérdez).

### 5. Utalások nézet
- Két lista a hónapon belül: **Bejövő** és **Kimenő**.
- Tétel: megnevezés, összeg, dátum, partner, megjegyzés — hozzáadás/szerkesztés/törlés.
- Visszatérő utalások gyorslistából (megjegyzett sablonok) egy koppintással.
- Alul: bejövő összeg, kimenő összeg.

### 6. Áttekintő / kimutató nézet (havi)
- **Bevétel** = bejövő utalások összege.
- **Kiadás** = kiadás-kategóriák összege (bolti költések) + kimenő utalások összege.
- **Egyenleg** = Bevétel − Kiadás (mennyi maradt / mínusz).
- Kiadások **kategóriánkénti** bontása (összeg + arány, egyszerű sávokkal).
- **Készpénz vs kártya** bontás a bolti kiadásoknál.
- Minden szám az aktuális hónapra. (Külső grafikon-könyvtár nélkül, egyszerű SVG sávok.)

### 7. Kötelező kiadások / emlékeztetők nézet
- Emlékeztetők listája: hozzáadás / szerkesztés / törlés (név, esedékesség napja, opcionális összeg).
- Az aktuális hónapra: melyik esedékes, mi van már **kifizetve**; „Kifizetve" gombbal jelölhető
  (opcionálisan kimenő utalást hoz létre az összeggel).
- Az áttekintőn is látszik: mennyi kötelező kiadás van még hátra ebben a hónapban.

### 8. Beállítások menü
- **Téma:** sötét / világos / rendszer szerinti.
- **Értesítések:** be/ki (esedékes kötelező kiadásokra — a korlátokat lásd lent).
- **Export** (CSV, hónapra/mindenre), **Backup mentése / visszatöltése**.
- **Kategóriák kezelése**, **Emlékeztetők kezelése**, **Blokk import** elérése.

### 9. Értesítések (esedékes kötelező kiadások) — és a korlát
- **Alap (ingyen, szerver nélkül):** amikor megnyitod az appot, kiemelt figyelmeztetés a
  ma/az e-havi esedékes, még ki nem fizetett kötelező kiadásokról. Ha engedélyezed az
  értesítéseket, az app **nyitáskor/használatkor** helyi értesítést is kitesz a ma esedékesekről.
- **Naptár-opció (ingyen, megbízható):** egy „Naptárba" gombbal az emlékeztető bekerül a telefon
  saját (ismétlődő) naptáreseményeként, és a teló **natívan** szól akkor is, ha az app zárva.
- **Korlát:** a valódi, garantált **háttér-push** (a teló akkor is szól, ha az app hetek óta
  zárva) egy PWA-ban csak **push-szerverrel** megbízható — ez extra beállítás és nem fér a
  „nincs szerver, ingyen" keretbe. Ezt később, külön lehet hozzátenni, ha kell.
- **Döntés:** app-on belüli figyelmeztetés + helyi értesítés (nyitáskor) + „Naptárba" (.ics)
  a natív, zárt-appnál is szóló riasztáshoz. Háttér-push most nincs.

### 10. Mentés & biztonság
- **Export**: Excel (`.xlsx` vagy CSV) — egy hónapra vagy az összesre. Megnyitható Excelben.
- **Backup mentése / visszatöltése**: egyetlen fájlba (JSON) kiment mindent, és visszatölt —
  telócsere vagy tárhely-törlődés esetére. Ez a biztonsági háló, mert az adat a telón él.

## Import-kód formátum (Claude ↔ app híd)

- A Claude a blokk fotójából strukturált listát készít, és egy **kompakt kódot** ad
  (tömör, beilleszthető szöveg — pontos formátum a megvalósításkor: pl. base64-elt JSON).
- A kód tartalma: tételek listája (`név, db, ár, üzlet, dátum, fizetési mód, javasolt
  kategória`) + a cél-hónap. A fizetési módot (kp/kártya) is kiolvasom a blokkról.
- Az app dekódolja, **előnézetben** mutatja (kategóriánként), a felhasználó módosíthat,
  majd egy koppintással beteszi a hónapba.
- A kód sima szöveg → Claude-független az app; a párja is beillesztheti a saját példányába.

## Technikai megközelítés

- **Egyfájlos web-app** (HTML + CSS + JS egyben), külső függőség nélkül, hogy offline is fusson.
- **PWA**: telepíthető a kezdőképernyőre, offline működik (manifest + service worker).
- **Tárolás**: a böngésző tartós tárhelye (localStorage vagy IndexedDB) — eldöntendő a
  megvalósításkor a megbízhatóság alapján; PWA-ként telepítve tartós.
- **Hosting**: stabil, ingyenes linken (a pontos hely a megvalósításkor dől el; a lényeg,
  hogy Ági egy linket kap, megnyitja, kezdőképernyőre teszi).
- **UI**: letisztult, nagy gombok, mobilra optimalizálva. **Emoji-mentes** (globális szabály:
  weboldal-tartalomban nincs emoji, helyette ikon/szöveg).
- **Nyelv**: magyar felület. Pénznem: HUF.

## Ami szándékosan NEM cél most (YAGNI)

- Teló↔Mac vagy két felhasználó közti **szinkron / közös kassza**.
- Felhő, fiók, bejelentkezés.
- Bonyolult grafikonok / külső chart-könyvtár (az áttekintő egyszerű SVG sávokkal megy).
- Több hónapot átfogó trend-elemzés (később hozzáadható, ha kell).
- Automatikus, közvetlen írás az appba a Claude-ból (nincs hozzá csatlakozó; az import-kód
  az áthidalás).

## Nyitott pontok a megvalósításhoz

- Tárolás localStorage vs IndexedDB — megbízhatóság/kapacitás alapján.
- Hosting pontos helye és a link átadásának módja.
- Export formátum: `.xlsx` vs `.csv` (vagy mindkettő).
- Import-kód: sima beillesztés vs. egy-koppintásos link — amelyik jobban működik Androidon.
