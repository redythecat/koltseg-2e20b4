---
name: koltseg-import
description: Blokk-fotóból vagy tétel-listából import a Költség appba. Használd, amikor a felhasználó blokkot/számlát küld vagy tételeket sorol fel a költségkövetőhöz ("tedd a költség-appba", "koltseg", "blokk", "kassza").
---

# Költség app — blokk import

Ez a projekt egy személyes költségkövető PWA. Élő link:
**https://redythecat.github.io/koltseg-2e20b4/**

Amikor a felhasználó blokk-fotót küld vagy tételeket sorol fel, a feladatod: kiolvasni a
tételeket, kategorizálni, és egy **egy-koppintásos import-linket** adni.

## Kategóriák (ezekbe sorolj)
- **Élelmiszer** — minden hétköznapi kaja: hús, zöldség, kenyér, fűszer, tej, kávé, stb.
- **Alkohol/üdítő** — alkohol és üdítők
- **Tisztítószer** — takarítás + tisztálkodás: mosogató, wc-papír, tusfürdő, izzadásgátló, stb.
- **Macska** — macskaalom, -kaja, játék
- **Luxus** — nasi, csoki, rendelt kaja, videojáték, egyéb élvezeti cikk

**Fontos:** a kategóriák felhasználónként eltérhetnek (mindenki átnevezheti/bővítheti a saját
appjában). Mindig a felhasználó AKTUÁLIS kategóriáit használd — ha ismered őket, azok szerint
sorolj; ha nem, kérdezd meg, vagy hagyd az app „Blokk import → Beolvasó szöveg másolása" gombjára,
ami az adott app saját kategóriáival gyártja a promptot. A fentiek az alapértelmezett kategóriák.
Ha egy tétel egyikbe sem illik, tedd a legközelebbibe — a felhasználó az appban átállíthatja.

## Adatformátum
Építs egy ilyen JSON objektumot:
```json
{
  "month": "YYYY-MM",
  "items": [
    { "name": "Tejföl", "qty": 2, "price": 780, "store": "Lidl", "date": "2026-08-03", "payment": "card", "category": "Élelmiszer" }
  ]
}
```
- `price`: az adott sor összege forintban (egész szám), NEM egységár.
- `qty`: darabszám (ha nincs, 1).
- `payment`: `"card"` (kártya) vagy `"cash"` (készpénz) — a blokk fejlécén/láblécén általában rajta van.
- `date`, `store`, `month`: a blokkról; ha a hónap nem derül ki, a jelenlegi hónap.

## Az import-link előállítása
A link: `https://redythecat.github.io/koltseg-2e20b4/?import=<PAYLOAD>`

A `<PAYLOAD>` lehet:
1. **base64-elt JSON** (kompakt — ezt preferáld, ha tudsz kódot futtatni), URL-kódolva, VAGY
2. **URL-kódolt sima JSON** (az app a sima JSON-t is elfogadja).

Ha van kódfuttatás (pl. Claude Code, node), így számítsd ki megbízhatóan:
```bash
node -e "const p={month:'2026-08',items:[/*...*/]}; const b=Buffer.from(JSON.stringify(p)).toString('base64'); console.log('https://redythecat.github.io/koltseg-2e20b4/?import='+encodeURIComponent(b));"
```
Add vissza a kész linket, hogy a felhasználó egy koppintással megnyithassa (előnézet → „Hozzáadás a hónaphoz").

## Ha nincs kódfuttatás (pl. mobil app)
Add vissza a **sima JSON**-t egy kódblokkban, és írd le: az appban **Beállítások → Blokk import**,
oda bemásolni, majd „Beolvasás". Az app a nyers JSON-t is elfogadja.

## Fontos
- Mindig **mutasd meg a felismert tételeket** a felhasználónak (név, db, ár, kategória), mielőtt
  a linket/JSON-t adod, hogy át tudja nézni.
- Ne találj ki árat/tételt; ha valami olvashatatlan a blokkon, kérdezz rá vagy jelöld bizonytalannak.
