export type ServiceIconName = "truck" | "building" | "book" | "support" | "search" | "document";
const paths: Record<ServiceIconName, string> = {
  truck: "M3 6h11v11H3z M14 10h4l3 4v3h-7 M7 17a2 2 0 1 0 0 4 2 2 0 0 0 0-4 M17 17a2 2 0 1 0 0 4 2 2 0 0 0 0-4",
  building: "M4 21V3h10v18 M14 9h6v12 M2 21h20 M7 7h1 M10 7h1 M7 11h1 M10 11h1 M7 15h1 M10 15h1 M17 13h1 M17 17h1",
  book: "M3 4h7l2 2 2-2h7v15h-7l-2 2-2-2H3z M12 6v15 M6 8h3 M6 12h3 M15 8h3 M15 12h3",
  support: "M4 13v-2a8 8 0 0 1 16 0v6a4 4 0 0 1-4 4h-4 M4 11H2v7h4v-7z M20 11h2v7h-4v-7z",
  search: "M16 16l5 5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  document: "M5 3h10l4 4v14H5z M15 3v5h4 M8 11h8 M8 15h8 M8 18h5",
};
export function ServiceIcon({ name }: { name: ServiceIconName }) {
  return <svg aria-hidden="true" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]} /></svg>;
}
