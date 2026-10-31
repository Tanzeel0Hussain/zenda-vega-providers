import { Post, ProviderContext } from "../types";
import {
  buildSearchUrl,
  firstValue,
  getLicenseFilter,
  getSortOrder,
  iaGet,
  imageUrl,
  sanitizeQuery,
} from "./api";

const searchItems = async (
  query: string,
  page: number,
  providerContext: ProviderContext,
  signal?: AbortSignal,
): Promise<Post[]> => {
  const [license, sort] = await Promise.all([
    getLicenseFilter(providerContext),
    getSortOrder(providerContext),
  ]);
  const url = buildSearchUrl(`(${query}) AND mediatype:movies AND ${license}`, page, 24, sort);
  const res = await iaGet(providerContext, url, signal);
  const docs: any[] = res.data?.response?.docs || [];
  return docs
    .filter((doc) => doc.identifier)
    .map((doc) => {
      const title = firstValue(doc.title) || doc.identifier;
      const year = firstValue(doc.year);
      return {
        title,
        link: doc.identifier,
        image: imageUrl(doc.identifier),
        cornerTag: year || undefined,
      };
    });
};

export const getPosts = async function ({
  filter,
  page,
  signal,
  providerContext,
}: {
  filter: string;
  page: number;
  providerValue: string;
  signal: AbortSignal;
  providerContext: ProviderContext;
}): Promise<Post[]> {
  return searchItems(filter, page, providerContext, signal);
};

export const getSearchPosts = async function ({
  searchQuery,
  page,
  signal,
  providerContext,
}: {
  searchQuery: string;
  page: number;
  providerValue: string;
  signal: AbortSignal;
  providerContext: ProviderContext;
}): Promise<Post[]> {
  const words = sanitizeQuery(searchQuery);
  if (!words) return [];
  // Searching by a person ("Buster Keaton") finds far more than title alone.
  return searchItems(`title:(${words}) OR creator:(${words})`, page, providerContext, signal);
};
