GAMESCO ESCAPE UPDATE V5

Fixes:
- Teamchef-Auswahl im Admin funktioniert wieder. Der fehlende Server-Handler admin:setTeamChef wurde ergänzt.
- Admin-Dropdowns und Listen klappen nicht mehr durch den Timer zu, weil die Admin-Ansicht nicht mehr jede Sekunde komplett neu rendert.
- Bomben-Timer startet in Runde 6 nicht mehr sofort, sondern automatisch erst, wenn der Admin einen Teamchef auswählt.
- Wenn der Teamchef entfernt wird, pausiert die Bombe wieder.
- Bomben-Piepton wird gedrosselt, damit er nicht doppelt/überlappend abgespielt wird.
- Runde 4 „Wer lügt?“ hat jetzt auswählbare Antwort-Buttons in der Spieleransicht.

Start:
npm install
npm start

Admin: http://localhost:3000/admin.html
Spieler: http://localhost:3000/player.html
