GAMESCO ESCAPE QUIZ - UPDATE V2

Geändert:
- Spieler landen nach Name + Avatar zuerst in einer Lobby.
- Vor Spielstart sehen Spieler nur Lobby, Zeit oben rechts und alle Mitspieler.
- Admin hat jetzt den Button „Spiel starten“.
- Nach Spielstart läuft automatisch ein globaler Escape-Timer.
- Standardzeit: 30 Minuten.
- Admin kann die Fluchtzeit im Admin-Panel ändern.
- Bei falschem Code, falschem Symbol, falschem Buchstaben-Code, falschem Kabel und falschem Finale-Code wird Zeit abgezogen.
- Standard-Abzug: 60 Sekunden pro Fehler.
- Admin kann den Fehler-Abzug im Admin-Panel ändern.
- Finale hat jetzt ein Exit-Code-Feld: Spieler können den finalen Code eingeben und entkommen.
- Die Bombe sieht jetzt mehr wie eine echte Spiel-Bombe aus: Gehäuse, Display, Kabelbrett und farbige Kabel zum Durchtrennen.
- Bombenansicht wurde für Spieler und Admin verbessert.
- Gewinner/Entkommen-Overlay wurde eingebaut.

Start:
1. ZIP entpacken
2. Terminal im Ordner öffnen
3. npm install
4. npm start
5. Admin: http://localhost:3000/admin.html
6. Spieler: http://localhost:3000/player.html

Wichtige Dateien:
- server.js: neue Lobby-, Timer-, Fehlerabzug- und Finale-Code-Logik
- public/player.html: neue Lobby, Avatar-Auswahl, Finale-Code, Bombenansicht
- public/admin.html: Spielstart, Timer-Einstellungen, Fehlerabzug, Bombensteuerung
- public/style.css: neue Designs
- data/runde5_config.json: Standard-Timer und Fehlerabzug
- data/memory_finale.json: Memory-Finale und Exit-Code
- data/codes.json: final_exit Code

Hinweis:
Falls du deine alten JSON-Dateien später noch nachschickst, kann ich sie in diese Version sauber einbauen.
