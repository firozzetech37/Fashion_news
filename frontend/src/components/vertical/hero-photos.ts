import type { StaticImageData } from "next/image"
import { connection } from "next/server"
import type { Vertical } from "@/lib/trends"
import bollywood1 from "@/assets/hero/bollywood-1.jpg"
import bollywood2 from "@/assets/hero/bollywood-2.jpg"
import bollywood3 from "@/assets/hero/bollywood-3.jpg"
import bollywood4 from "@/assets/hero/bollywood-4.jpg"
import bollywood5 from "@/assets/hero/bollywood-5.jpg"
import bollywood6 from "@/assets/hero/bollywood-6.jpg"
import hollywood1 from "@/assets/hero/hollywood-1.jpg"
import hollywood2 from "@/assets/hero/hollywood-2.jpg"
import hollywood3 from "@/assets/hero/hollywood-3.jpg"
import hollywood4 from "@/assets/hero/hollywood-4.jpg"
import hollywood5 from "@/assets/hero/hollywood-5.jpg"
import hollywood6 from "@/assets/hero/hollywood-6.jpg"

export interface HeroPhoto {
  src: StaticImageData
  alt: string
  /** Photographer, and the photo's page on Pexels */
  credit: string
  source: string
}

/** Mood photos for the vertical heroes, one shown at random per visit. Free to use under the Pexels License (pexels.com/license). */
export const HERO_PHOTOS: Partial<Record<Vertical, HeroPhoto[]>> = {
  bollywood: [
    { src: bollywood1, alt: "Bride in a red veil and gold jewellery", credit: "Rani Sahu", source: "https://www.pexels.com/photo/14848717/" },
    { src: bollywood2, alt: "Bride in a red embroidered lehenga under stone arches", credit: "aman ajimal Fashion Stylist", source: "https://www.pexels.com/photo/12411105/" },
    { src: bollywood3, alt: "Woman twirling a red and gold bridal lehenga", credit: "aman ajimal Fashion Stylist", source: "https://www.pexels.com/photo/10213950/" },
    { src: bollywood4, alt: "Bride in a red lehenga with diamond jewellery and warm lights", credit: "Nirmal Kushwah", source: "https://www.pexels.com/photo/34345410/" },
    { src: bollywood5, alt: "Woman in a yellow embroidered lehenga seated in a carved courtyard", credit: "Abdullah Shahid", source: "https://www.pexels.com/photo/16651974/" },
    { src: bollywood6, alt: "Bride in a deep red lehenga against a paisley backdrop", credit: "aman ajimal Fashion Stylist", source: "https://www.pexels.com/photo/13022612/" },
  ],
  hollywood: [
    { src: hollywood1, alt: "Woman in a blue sequin gown on a red carpet at night", credit: "Kacey Inkwell", source: "https://www.pexels.com/photo/38507931/" },
    { src: hollywood2, alt: "Black and white portrait of a woman in a satin gown and gloves", credit: "Arturo Rodríguez Ortega", source: "https://www.pexels.com/photo/25283993/" },
    { src: hollywood3, alt: "Woman in a black evening gown and fur at an evening event", credit: "Karl Rayson", source: "https://www.pexels.com/photo/16894090/" },
    { src: hollywood4, alt: "Film noir portrait of a woman in an off-shoulder black dress", credit: "cottonbro studio", source: "https://www.pexels.com/photo/7322289/" },
    { src: hollywood5, alt: "The Hollywood sign under a dramatic sky", credit: "Gursher Gill", source: "https://www.pexels.com/photo/20115760/" },
    { src: hollywood6, alt: "Woman in a red evening gown holding roses", credit: "OLUWATOBI BALOGUN", source: "https://www.pexels.com/photo/15591723/" },
  ],
}

/** A different photo on each visit: connection() makes the pick wait for the request instead of being baked in at build time. */
export async function pickHeroPhoto(photos: HeroPhoto[]) {
  await connection()
  return photos[Math.floor(Math.random() * photos.length)]
}
