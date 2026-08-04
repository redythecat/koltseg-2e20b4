// Verzió-napló — legfrissebb legfelül. Emberi nyelven, röviden.
export const CHANGELOG = [
  {
    v: "2.24", date: "2026-08-04", notes: [
      "Az elmentett tétel és pénzmozgás szerkesztése felugró ablakban nyílik (nem külön oldalon).",
      "A telefon Vissza gombja most bezárja a nyitott ablakot.",
      "Beállítások legalján „Frissítés keresése” gomb — így nem kell találgatni, megjött-e az új verzió.",
    ],
  },
  {
    v: "2.23", date: "2026-08-04", notes: [
      "Minden felugró ablak (súgó, verzió-napló, kérdések, szerkesztők) jobb felső sarkában bezáró X — a hosszú, görgethető ablakokban is végig látszik.",
      "Kategória törlése két lépésben: előbb csak az áthelyezés / tételek törlése / mégse, és csak áthelyezésnél jön elő a kategória-választó (sok kategóriánál is átlátható).",
      "Kategóriák kezelése: az „Új kategória” felülre került, a havi keret magyarázója pedig elhagyva.",
    ],
  },
  {
    v: "2.22", date: "2026-08-04", notes: [
      "Szövegek pontosítva: „Blokk import” → „Blokk bevitel”, és a beolvasásnál már nem linket ígér, hanem JSON-t (a Claude azt ad vissza).",
      "A súgó kiegészült: elmentett tételek, pénzmozgás (kötelező/egyéb, átvezetés), kilépés dupla Vissza-gombbal.",
      "Beállítások → Kezelés új sorrendben, az Értesítések pedig egy ki/be csúszka lett.",
    ],
  },
  {
    v: "2.21", date: "2026-08-04", notes: [
      "A kimenő pénzmozgás lehet „kötelező” vagy „egyéb”: a Kifizetve gombbal rögzítettek automatikusan kötelezők, a kézzel felvitteknél pipával jelölheted. A régi, Kifizetvéből született tételeket az app magától felismeri.",
      "Havi és Éves statisztika azonos, érthető bontásban: összes / kötelező / egyéb / bolti (+kp/kártya) / bejövő — és az évesben is látszik a legtöbbet költött hely meg a legnagyobb tétel.",
    ],
  },
  {
    v: "2.20", date: "2026-08-04", notes: [
      "Áttekintő átrendezve: a statisztika kettévált Havi és Éves kártyára (legalul), mindkettőben bolti kp/kártya összeggel.",
      "A Kötelező kiadások kártya rövidebb: csak az összegek (összesen, kifizetve, hátralévő + kp/kártya bontás), a pipálható lista a Kiadások fülön maradt.",
    ],
  },
  {
    v: "2.19", date: "2026-08-04", notes: [
      "Átvezetés „Csere valakivel”: megadható az irány is (kártya → kp vagy kp → kártya), és a listában, Excelben is látszik.",
    ],
  },
  {
    v: "2.18", date: "2026-08-04", notes: [
      "Új a Pénzmozgásban: Átvezetés — készpénzfelvétel, befizetés kártyára vagy csere valakivel. Csak napló: semmilyen összesítésbe nem számít bele.",
      "Kilépés egyszerűbben: kérdés-ablak helyett a Vissza gombot kétszer megnyomva lépsz ki (az első nyomásnál lent egy üzenet jelzi).",
    ],
  },
  {
    v: "2.17", date: "2026-08-04", notes: [
      "A kilépés-kérdés „Kilépés” gombja telepített appban is bezárja az appot (eddig csak az ablakot csukta be).",
      "Elmentett tételeknél mostantól a pénzmozgás-gyorslista is szerkeszthető/törölhető (Beállítások → Kezelés).",
      "Statisztika: éves összes / kötelező / bolti kiadás külön sorban, és ide került a havi kimenő + bejövő pénzmozgás is.",
      "Kötelező kiadásnál megadható a fizetés módja (kártya vagy készpénz).",
    ],
  },
  {
    v: "2.16", date: "2026-08-04", notes: [
      "A kilépés-kérdésnél a „Kilépés” most valóban bezárja az appot (megbízhatóbb módon).",
    ],
  },
  {
    v: "2.15", date: "2026-08-04", notes: [
      "Vissza-gomb újraírva, megbízhatóbban: bármelyik fülről és bármilyen mélységből helyesen lép vissza (pl. szerkesztő → lista → Beállítások), és a főképernyőn rákérdez: „Biztos kilépsz?”.",
    ],
  },
  {
    v: "2.12", date: "2026-08-04", notes: [
      "Blokk import előnézet fejlécében a nap is látszik (pl. „2026. augusztus 04.”), ha a tételek egy dátumhoz tartoznak.",
    ],
  },
  {
    v: "2.11", date: "2026-08-04", notes: [
      "Blokk import előnézet szebb elrendezés: a tétel adatai és a kategória fele-fele helyet kapnak; a kategórianév a helyhez rövidül (pl. „Élelmisz.”), koppintással választható.",
    ],
  },
  {
    v: "2.10", date: "2026-08-04", notes: [
      "Blokk import előnézet: „Összesen: X Ft” a beolvasott tételekről — egyeztethető a blokk végösszegével.",
      "Kereső a Pénzmozgásnál is (megnevezés vagy partner szerint).",
    ],
  },
  {
    v: "2.9", date: "2026-08-04", notes: [
      "Kiadások tetején a havi összeg lenyitható: válaszd ki, a „Havi összes” vagy a „Bolti (kötelezők nélkül)” szám legyen az elsődleges. Ha nincs kötelező/utalás, csak egy szám van.",
    ],
  },
  {
    v: "2.8", date: "2026-08-04", notes: [
      "Áttekintő becslés kettévált: „Várható bolti kiadás” (a napi vásárlás előrevetítve) és „Várható havi összes” (a kötelező/utalás kiadásokkal, azok nem felszorozva).",
    ],
  },
  {
    v: "2.7", date: "2026-08-04", notes: [
      "Blokk import előnézet: egy tétel nevét hosszan nyomva javíthatod a nevet és az üzletet (ha a blokk félreolvasta).",
    ],
  },
  {
    v: "2.6", date: "2026-08-04", notes: [
      "Új tételnél a darabszám állításakor az ár automatikusan szorzódik az egységárral (ha kézzel átírod az árat, abból újraszámol).",
    ],
  },
  {
    v: "2.5", date: "2026-08-04", notes: [
      "Elmentett tételek kezelője (Beállítások → Kezelés): keresés, szerkesztés, törlés.",
      "Új tételnél a gyorslista összecsukható és kereshető — 600 tételnél is átlátható.",
      "Kategória áthelyezése most látványosan átcsúszik (animáció).",
    ],
  },
  {
    v: "2.4", date: "2026-08-04", notes: [
      "Kötelező kiadás: az ismétlődés lehet „Egyszeri”, és az értesítés külön ki/be kapcsolható.",
      "„Utalások” → „Pénzmozgás”: megadható, hogy készpénz vagy utalás.",
      "Kategóriák sorrendje átrendezhető: a fogantyút (≡) tartsd nyomva, majd húzd.",
      "Darabszámos tételnél a gyorslista az egységárat jegyzi meg (felfelé kerekítve); a tényleges kiadás pontos marad.",
    ],
  },
  {
    v: "2.3", date: "2026-08-03", notes: [
      "Törlésnél megerősítést kér (tétel, utalás, emlékeztető) — véletlen ellen.",
      "Üres-állapot súgó, ha még nincs tétel a hónapban.",
      "„Hogyan használd” súgó a Beállításokban.",
      "Betűméret: kicsi / normál / nagy — az egész app arányosan igazodik.",
      "Áttekintő statisztika: hol költöttél a legtöbbet, legnagyobb tétel, éves összeg.",
      "A Beállítások fül most fogaskerék ikon, és átláthatóbb a menürend.",
    ],
  },
  {
    v: "2.2", date: "2026-08-03", notes: [
      "A lenti menü nyila is nagyobb, cuki köröcskében.",
      "Egyértelműbb szöveg: „Várható havi kiadás”.",
    ],
  },
  {
    v: "2.1", date: "2026-08-03", notes: [
      "A várható havi összeg mindig látszik (a hónap elején is), rövid magyarázattal.",
      "Még nagyobb, jól látható összecsukó nyíl-ikonok.",
    ],
  },
  {
    v: "2.0", date: "2026-08-03", notes: [
      "Csinosítás: kiemeltebb havi kiadás (színes háttérrel), látványosabb összecsukó nyilak, letisztultabb alsó menü.",
    ],
  },
  {
    v: "1.9", date: "2026-08-03", notes: [
      "Nagyobb, jobban látható összecsukó nyilak és alsó menügombok — könnyebb megnyomni.",
      "A havi kiadás összege felülre került, mindig szem előtt van.",
      "Áttekintő: érthetőbb „Várható havi összeg” magyarázattal (csak a hónap 5. napjától).",
    ],
  },
  {
    v: "1.8", date: "2026-08-03", notes: [
      "Havi keret kategóriánként: a Kiadásoknál sáv mutatja, hol tartasz, és pirosra vált túllépéskor.",
      "Áttekintőn: az előző hónaphoz képesti változás és hó végi becslés.",
      "Keresés a Kiadásoknál név vagy üzlet szerint.",
      "Megbízhatóság: helyi dátum (éjfél körül is pontos) és tárhely-megtelt kezelése.",
    ],
  },
  {
    v: "1.7", date: "2026-08-03", notes: [
      "A blokk-beolvasó szöveg mostantól a te saját kategóriáidhoz igazodik.",
      "Egyértelműbb gombnevek: „Biztonsági mentés fájlba” (visszaállításhoz) és külön az Excel táblázat.",
      "A verzió-napló csak az elmúlt 2 hét változásait mutatja.",
    ],
  },
  {
    v: "1.6", date: "2026-08-03", notes: [
      "Az export mostantól Excel (.xlsx) fájl — az Excel egyből, rendesen oszlopokba nyitja, a számok számként.",
      "Heti mentésnél az app felajánlja, hogy fájlba/felhőbe is elmentsd — egy koppintás (iPhone-on is).",
      "Feltűnő figyelmeztetés a Beállításokban: az adat a telefonon van, mentsd rendszeresen.",
    ],
  },
  {
    v: "1.5", date: "2026-08-03", notes: [
      "Automatikus heti mentés: megnyitáskor készül, az utolsó 3 elérhető a Visszaállításnál.",
      "A verzió-napló 20 soronként tölt be, hogy kímélje a telefont.",
    ],
  },
  {
    v: "1.4", date: "2026-08-03", notes: [
      "Verzió-ablak: itt látod, mikor mi újult meg.",
      "iPhone-on is szépen működik (ikon, telepítés).",
    ],
  },
  {
    v: "1.3", date: "2026-08-03", notes: [
      "Új név és arany érme-logó.",
      "Szebb, appon belüli kérdés-ablakok (eltűnt a csúnya webcím a megerősítéseknél).",
    ],
  },
  {
    v: "1.2", date: "2026-08-03", notes: [
      "A kötelező kiadások mindig legfelül; 3 napon belül pirossal figyelmeztet.",
      "Év és hónap kiválasztható listából.",
      "Választható kiemelő szín, sötét/világos téma.",
      "A kategóriák és utalások összecsukhatók.",
      "Fektetett nézetben elrejthető az alsó menü.",
    ],
  },
  {
    v: "1.1", date: "2026-08-03", notes: [
      "Blokk beolvasása: a Claude-tól kapott linkkel egy koppintással bekerülnek a tételek.",
      "Emlékeztetők a telefon naptárába tehetők, riasztással.",
    ],
  },
  {
    v: "1.0", date: "2026-08-03", notes: [
      "Első verzió: kiadások kategóriánként, utalások, havi áttekintő, export és mentés.",
    ],
  },
];

export const APP_VERSION = CHANGELOG[0].v;
export const APP_DATE = CHANGELOG[0].date;
