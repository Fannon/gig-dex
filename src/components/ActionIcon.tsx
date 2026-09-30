const paths = {
  add: "M12 5v14M5 12h14",
  remove: "M5 12h14",
  edit: "M15 5l4 4M4 20l4-1L20 7a3 3 0 0 0-4-4L5 15z",
  perform: "M8 4l12 8-12 8z",
  delete: "M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7",
  cancel: "M6 6l12 12M6 18L18 6",
  save: "M4 12l5 5L20 6",
  search: "M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  sync: "M20 11a8.1 8.1 0 0 0-15.5-2M4 4v5h5M4 13a8.1 8.1 0 0 0 15.5 2M20 20v-5h-5",
};
export function ActionIcon({ name }: { name: keyof typeof paths }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
