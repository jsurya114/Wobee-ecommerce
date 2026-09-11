export type TestimonialStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface TestimonialImageEntity {
  id: string;
  url: string;
}

export interface TestimonialEntity {
  id: string;
  orderId: string;
  customerId: string;
  rating: number;
  text: string;
  status: TestimonialStatus;
  createdAt: Date;
  updatedAt: Date;
  images: TestimonialImageEntity[];
}
