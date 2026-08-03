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

## Adatmodell

```
Hónap (pl. "2026-08")
 └─ Kategória (felhasználó által szerkeszthető: Élelmiszer, Alkohol/üdítő,
    Tisztítószer, Macska, Luxus)
     └─ Tétel
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

### 5. Mentés & biztonság
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
- Grafikonok, statisztikák a havi/kategória-összegen túl (később hozzáadható, ha kell).
- Automatikus, közvetlen írás az appba a Claude-ból (nincs hozzá csatlakozó; az import-kód
  az áthidalás).

## Nyitott pontok a megvalósításhoz

- Tárolás localStorage vs IndexedDB — megbízhatóság/kapacitás alapján.
- Hosting pontos helye és a link átadásának módja.
- Export formátum: `.xlsx` vs `.csv` (vagy mindkettő).
- Import-kód: sima beillesztés vs. egy-koppintásos link — amelyik jobban működik Androidon.
