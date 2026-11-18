// Prefixes the site base: href('routes/') -> "/my-gpx-files/routes/"
export const href = (path: string) => `${import.meta.env.BASE_URL.replace(/\/$/, '')}/${path}`;
