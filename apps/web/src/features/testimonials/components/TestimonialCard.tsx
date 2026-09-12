import { StarRatingDisplay } from "./StarRating";

export interface TestimonialCardData {
  id: string;
  rating: number;
  text: string;
  displayName: string;
  images: { id: string; url: string }[];
}

/**
 * Never the uploaded photo as a face-avatar substitute — that would
 * misrepresent a photo of the clothing/packaging as the customer's own
 * likeness (2026-09-11 design's "Customer Photo vs Profile Photo" rule: no
 * fabricated profile avatars, no stock faces). The avatar is always a
 * tasteful initial; any uploaded photo(s) render separately, below the
 * text, as testimonial media.
 */
function initialFor(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "W";
}

export function TestimonialCard({ testimonial }: { testimonial: TestimonialCardData }) {
  return (
    <div className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-tint font-display text-sm text-primary">
          {initialFor(testimonial.displayName)}
        </div>
        <div className="min-w-0">
          <p className="truncate font-body text-sm font-medium text-text-primary">{testimonial.displayName}</p>
          <p className="font-body text-xs text-text-secondary">Verified Customer</p>
        </div>
      </div>

      <StarRatingDisplay rating={testimonial.rating} />

      <p className="line-clamp-5 font-body text-sm text-text-secondary">{testimonial.text}</p>

      {testimonial.images.length > 0 ? (
        <div className="flex gap-2">
          {testimonial.images.map((image) => (
            <img
              key={image.id}
              src={image.url}
              alt="Customer-shared photo"
              loading="lazy"
              decoding="async"
              className="h-16 w-16 shrink-0 rounded-control border border-border object-cover"
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
