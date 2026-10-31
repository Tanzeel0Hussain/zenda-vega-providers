# vega-providers (Tanzeel's fork)

This is my fork of [Zenda-Cross/vega-providers](https://github.com/Zenda-Cross/vega-providers),
the provider extensions for the [Vega app](https://github.com/Zenda-Cross/vega-app).
A provider is a small TypeScript module that tells Vega how to browse,
search and play videos from one website.

My addition is an **Internet Archive provider**. It was accepted upstream in
[Zenda-Cross/vega-providers#36](https://github.com/Zenda-Cross/vega-providers/pull/36),
so it ships with the default provider source. Subtitles and the sort setting
are pending in
[#37](https://github.com/Zenda-Cross/vega-providers/pull/37), from the branch
[`feat/internet-archive-subtitles`](https://github.com/Tanzeel0Hussain/zenda-vega-providers/tree/feat/internet-archive-subtitles).
The same provider is also published on its own in
[Tanzeel0Hussain/vega-providers](https://github.com/Tanzeel0Hussain/vega-providers).

## Internet Archive provider

[archive.org](https://archive.org) hosts thousands of films and TV episodes
that are in the public domain or under Creative Commons licenses, so they are
free and legal to watch. The provider brings them into Vega.

What it does:

- **Home screen rows:** Popular Classic Films, Silent Films, Sci-Fi & Horror,
  Classic TV, Cartoons & Animation and Short Films.
- **Genres:** Drama, Comedy, Horror, Western, Mystery, Romance, War, Film Noir
  and Science Fiction.
- **Search** across the whole video collection.
- **Details page** with title, description, poster, the year and subjects as
  tags, and the IMDb ID when the item has one.
- **Playback** of the original video files (MP4 and others). An item with
  several versions of one film (different qualities) is shown as one movie
  with a choice of quality, not as a series.
- **Subtitles** (pending in #37): SRT and WebVTT files in an item show up in
  the player, named by language; Internet Archive's own speech-recognition
  captions are labelled "Automatic captions".
- **Settings:** in Vega's Provider Manager choose "Public domain and Creative
  Commons" (default) or "Public domain only". Sorting lists by most popular,
  recently added or highest rated is part of the same pending #37.

It uses the official Internet Archive search and metadata APIs, not page
scraping, so it does not break when the website's layout changes.

## Use it in the Vega app

Internet Archive is in the default provider source now, so once Vega has
refreshed its provider list:

1. Open Vega and go to **Settings → Provider Manager**.
2. Select **Internet Archive** as the provider.

To try the pending subtitles and sort version before it is merged, add a
provider source instead:

1. In Provider Manager, tap **Add provider source** (the + button).
2. Paste this link:

```
https://github.com/Tanzeel0Hussain/zenda-vega-providers/tree/feat/internet-archive-subtitles
```

3. Install **Internet Archive** from that source and select it.

The short source name `Tanzeel0Hussain` also works, and loads
[Tanzeel0Hussain/vega-providers](https://github.com/Tanzeel0Hussain/vega-providers),
which carries the same provider on its own.

## Run and test it on a computer

You need Node.js 18 or newer.

```bash
git clone https://github.com/Tanzeel0Hussain/zenda-vega-providers.git
cd zenda-vega-providers
npm install
npm run build              # compiles providers/ into dist/
npm run test:unit          # offline tests, no network needed
npm run test:provider      # interactive: pick "internetArchive", then a function such as getPosts
```

`npm run dev` serves the built providers on port 3001, so a debug build of
Vega in test mode can load them from your computer while you develop.

### How the code is organised

```
providers/internetArchive/
  api.ts        search URL builder, license filter, helpers
  catalog.ts    home screen rows and genres (Internet Archive search queries)
  posts.ts      lists and search results
  meta.ts       details page, movie vs series, IMDb ID
  stream.ts     playable video files and their quality
  settings.ts   the license option shown in Provider Manager
```

Every provider follows the same layout. See [AGENTS.md](AGENTS.md) for the
full list of functions and types a provider exports.

---

Original project by [Zenda-Cross](https://github.com/Zenda-Cross):
"My personal providers for the Vega app".

<a href="https://www.buymeacoffee.com/ZendaX" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me a Coffee" style="height: 60px !important;width: 217px !important;" ></a>
