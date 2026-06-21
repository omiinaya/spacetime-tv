const API = "/api";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export const api = {
  live: {
    categories: () => get<{ categories: Category[] }>("/live/categories"),
    streams: (catId: string) =>
      get<{ streams: LiveStream[] }>(`/live/streams?category_id=${catId}`),
  },
  movies: {
    categories: () => get<{ categories: Category[] }>("/movies/categories"),
    list: (catId: string, limit = 20, offset = 0) =>
      get<{ movies: Movie[]; total: number; offset: number; limit: number }>(
        `/movies?category_id=${catId}&limit=${limit}&offset=${offset}`
      ),
  },
  series: {
    categories: () => get<{ categories: Category[] }>("/series/categories"),
    list: (catId: string, limit = 20, offset = 0) =>
      get<{ series: Series[]; total: number; offset: number; limit: number }>(
        `/series?category_id=${catId}&limit=${limit}&offset=${offset}`
      ),
    details: (id: number) => get<any>(`/series/${id}`),
  },
  guide: {
    get: (channel?: string) =>
      get<{ programmes: Programme[]; channels: Channel[] }>(
        `/guide${channel ? `?channel=${encodeURIComponent(channel)}` : ""}`
      ),
  },
  search: (q: string) =>
    get<{ live: LiveStream[]; movies: Movie[]; series: Series[] }>(
      `/search?q=${encodeURIComponent(q)}`
    ),
};

export interface Category {
  category_id: string;
  category_name: string;
  parent_id: number;
}

export interface LiveStream {
  num: number;
  name: string;
  stream_type: string;
  stream_id: number;
  stream_icon: string;
  epg_channel_id: string;
  category_id: string;
}

export interface Movie {
  num: number;
  name: string;
  stream_id: number;
  stream_icon: string;
  rating: string;
  rating_5based: number;
  tmdb?: string;
  category_id: string;
  container_extension: string;
}

export interface Series {
  num: number;
  name: string;
  series_id: number;
  cover: string;
  plot: string;
  cast: string;
  director: string;
  genre: string;
  releaseDate: string;
  rating: string;
  rating_5based: string;
  tmdb: string;
  youtube_trailer: string;
  category_id: string;
}

export interface Programme {
  channel: string;
  channel_name: string;
  start: string;
  stop: string;
  title: string;
  subtitle: string;
  desc: string;
  category: string;
  is_live: boolean;
}

export interface Channel {
  id: string;
  name: string;
  icon: string;
}
