/**
 * Developer information — ONE central place (owner-provided,
 * 2026-10-24). The DeveloperProfile component in the public
 * Footer reads everything from here, so changing a value here
 * updates every public page at once.
 *
 * `email` is the developer's OWN contact address for the
 * "Developer Contact" row. It stays null until the owner provides
 * his real developer email — the organization's email must never
 * be used as his personal developer email without his permission
 * (his explicit rule). While null, the contact row is not shown.
 *
 * `phoneDisplay`/`phoneHref` power the Phone row (the developer's
 * own number, inside his profile only — not the organization's
 * contact; the organization deliberately shows no phone).
 */
export const DEVELOPER = {
  name: "MD Sohel Rana",
  role: "Web Developer",
  description: "Designed & Developed this Website",
  photoPath: "developer.jpg",
  githubUrl: "https://github.com/fbsohel",
  facebookUrl: "https://www.facebook.com/fbsohel",
  email: null as string | null,
  phoneDisplay: "01956383607",
  phoneHref: "tel:01956383607",
} as const;
