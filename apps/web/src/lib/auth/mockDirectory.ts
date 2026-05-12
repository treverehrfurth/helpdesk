import type { UserProfile, UserRole } from "@it-helpdesk/shared";

export const directoryUsers: UserProfile[] = [
  {
    email: "maya.patel@example.com",
    name: "Maya Patel",
    role: "end_user"
  },
  {
    email: "nina.garcia@example.com",
    name: "Nina Garcia",
    role: "end_user"
  },
  {
    email: "jordan.lee@example.com",
    name: "Jordan Lee",
    role: "tech"
  },
  {
    email: "chris.brennan@example.com",
    name: "Chris Brennan",
    role: "tech"
  },
  {
    email: "avery.morgan@example.com",
    name: "Avery Morgan",
    role: "admin"
  }
];

export const mockUsersByRole: Record<UserRole, UserProfile> = {
  end_user: directoryUsers[0],
  tech: directoryUsers[2],
  admin: directoryUsers[4]
};

export const assignableUsers = directoryUsers.filter(
  (user) => user.role === "tech" || user.role === "admin"
);
