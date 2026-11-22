// Path to a file in /public that also works when the app is served from a sub-folder (preview build).
export const A = (p) => `${import.meta.env.BASE_URL}${p}`;
