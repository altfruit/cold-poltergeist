# Discord Moderation & Welcomer Bot

Ein kleiner Discord-Bot auf Basis von `discord.js` mit Slash-Commands und einer Willkommensnachricht.

## Funktionen

- `/kick user reason`
- `/ban user reason`
- `/timeout user minutes reason`
- `/clear amount`
- `/ping`
- `/setup` öffnet ein Embed mit Dropdown-Menü für alle Einstellungen
- Automatische Antwort auf `Can I speak with Mariah?` inklusive Ping an konfigurierte Admin- und Supervisor-Rollen
- Automatische Willkommensnachricht beim Beitritt:
  > Hey welcome to (Server name), we warmly welcome you as our (member count)th member and if you got any open questions feel free to ask staff.

## Einrichtung

1. Installiere Node.js 18 oder neuer.
2. Erstelle im [Discord Developer Portal](https://discord.com/developers/applications) eine Application und einen Bot.
3. Kopiere `.env.example` nach `.env` und trage Token, Application-ID und optional die Server-ID ein. Der Welcome-Kanal wird danach mit `/setup welcome #channel` gesetzt.
4. Aktiviere beim Bot den **Server Members Intent**.
5. Aktiviere zusätzlich den **Message Content Intent**, damit der Mariah-Trigger Nachrichten lesen kann.
6. Lade den Bot mit den Scopes `bot` und `applications.commands` ein. Er benötigt mindestens `View Channels`, `Send Messages`, `Manage Messages`, `Kick Members`, `Ban Members` und `Moderate Members`.
7. Installiere und starte den Bot:

```sh
npm install
npm run check
npm start
```

`GUILD_ID` sorgt für schnelle Command-Updates in einem Testserver. Ohne `GUILD_ID` werden die Commands global registriert, was bei Discord etwas dauern kann.

## Setup im Server

Verwende `/setup`. Wähle danach im Dropdown die gewünschte Einstellung. Für Kanäle und Rollen öffnet sich ein Formular. Du kannst eine Erwähnung oder eine ID eintragen; bei Mod-, Supervisor- und Admin-Rollen zusätzlich `add` oder `remove`.

```text
/setup
```

Die Konfiguration wird pro Server in `data/guild-config.json` gespeichert. Die Rollen-Prüfung gilt für die Moderationsbefehle; wenn noch keine Rollen eingerichtet sind, verwendet der Bot die normalen Discord-Berechtigungen als Fallback.

## Dauerhaftes Hosting mit Render

Die Datei `render.yaml` ist für einen Render **Background Worker** vorbereitet. Ein Background Worker ist für Discord-Bots passend, weil er keinen Webserver-Port benötigt.

1. Lade dieses Repository zu GitHub hoch.
2. Öffne [Render](https://render.com), wähle **New → Blueprint** und verbinde das GitHub-Repository.
3. Render erkennt `render.yaml`. Setze `DISCORD_TOKEN`, `CLIENT_ID` und optional `GUILD_ID` als Secret-Umgebungsvariablen.
4. Aktiviere im Discord Developer Portal **Server Members Intent** und **Message Content Intent**.
5. Starte den Worker. Die Persistent Disk bewahrt `data/guild-config.json` bei Neustarts auf.

Der Worker-Tarif und die Persistent Disk sind bei Render kostenpflichtig. Ohne Persistent Disk würde die `/setup`-Konfiguration bei einem neuen Deploy verloren gehen. Das Bot-Token niemals in Git committen, sondern ausschließlich als Render-Secret hinterlegen.
