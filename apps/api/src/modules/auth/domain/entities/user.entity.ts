export interface UserEntity {
  id: string;
  email: string;
  phone: string | null;
  name: string;
  role: "CUSTOMER" | "ADMIN";
}
// TODO (Day 2): add domain behavior here if a use-case needs it
// (e.g. canPlaceOrder()) — keep this framework/Prisma-free either way.
