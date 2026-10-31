import { Catalog } from "../types";

// Filters are Internet Archive search queries; posts.ts adds the media type
// and license restrictions.
export const catalog: Catalog[] = [
  { title: "Popular Classic Films", filter: "collection:feature_films" },
  { title: "Silent Films", filter: "collection:silent_films" },
  { title: "Sci-Fi & Horror", filter: "collection:SciFi_Horror" },
  { title: "Classic TV", filter: "collection:classic_tv" },
  { title: "Cartoons & Animation", filter: "collection:animationandcartoons" },
  { title: "Short Films", filter: "collection:short_films" },
  // Staying inside the film collections keeps personal uploads off the row.
  {
    title: "Documentaries",
    filter: "subject:(documentary) AND collection:(feature_films OR short_films)",
  },
  { title: "Ephemeral & Historical", filter: "collection:prelinger" },
];

export const genres: Catalog[] = [
  { title: "Drama", filter: "collection:feature_films AND subject:(drama)" },
  { title: "Comedy", filter: "collection:feature_films AND subject:(comedy)" },
  { title: "Horror", filter: "collection:feature_films AND subject:(horror)" },
  { title: "Western", filter: "collection:feature_films AND subject:(western)" },
  { title: "Mystery", filter: "collection:feature_films AND subject:(mystery)" },
  { title: "Romance", filter: "collection:feature_films AND subject:(romance)" },
  { title: "War", filter: "collection:feature_films AND subject:(war)" },
  { title: "Adventure", filter: "collection:feature_films AND subject:(adventure)" },
  { title: "Fantasy", filter: "collection:feature_films AND subject:(fantasy)" },
  { title: "Musical", filter: "collection:feature_films AND subject:(musical)" },
  {
    title: "Documentary",
    filter: "subject:(documentary) AND collection:(feature_films OR short_films)",
  },
  { title: "Film Noir", filter: 'collection:feature_films AND subject:("film noir")' },
  { title: "Science Fiction", filter: 'collection:feature_films AND subject:("science fiction")' },
];
