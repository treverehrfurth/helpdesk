import { appRoles } from "../constants/tickets";

export type UserRole = (typeof appRoles)[number];

export type UserProfile = {
  email: string;
  name: string;
  role: UserRole;
};
