GAMESCO ESCAPE QUIZ - UPDATE V7

Neu hinzugefügt nach der Bombe und vor dem Finale:

Runde 7: Laser-Raum
- Teamchef sieht Spiegel-Steuerung.
- Alle anderen Spieler sehen Sicherheitsprotokolle/Fake-Seiten.
- Bearbeitbar in data/laser_raum.json.

Runde 8: Giftiger Trank
- Teamchef sieht 8 Flaschen und muss die richtige Flasche auswählen.
- Alle anderen Spieler sehen Laborberichte/Rezeptzettel/Fake-Seiten.
- Bearbeitbar in data/giftiger_trank.json.

Runde 9: Lüftungssystem
- Teamchef sieht Ventile und muss Werte einstellen.
- Alle anderen Spieler sehen Wartungsberichte/Fake-Seiten.
- Bearbeitbar in data/lueftungssystem.json.

Runde 10: Fahrstuhl
- Teamchef sieht Fahrstuhl-Panel und drückt Etagen in Reihenfolge.
- Alle anderen Spieler sehen Etagen-Hinweise/Fake-Seiten.
- Bearbeitbar in data/fahrstuhl.json.

Finale ist jetzt Runde 11.

Neue Dateien im data-Ordner:
- laser_raum.json
- giftiger_trank.json
- lueftungssystem.json
- fahrstuhl.json

Admin-Panel:
- Alle neuen Dateien können unter JSON-Dateien bearbeiten angepasst werden.
- Jede neue Runde hat Teamchef-Pflicht.
- Vor Teamchef-Auswahl sehen Spieler keine Lösung/Steuerung.

Start:
npm install
npm start

Admin: http://localhost:3000/admin.html
Spieler: http://localhost:3000/player.html
