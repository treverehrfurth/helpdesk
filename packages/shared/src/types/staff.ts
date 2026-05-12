export type StaffMember = {
  id: string;
  email: string;
  displayName: string;
  role: "tech" | "admin";
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CreateStaffMemberInput = {
  email: string;
  displayName: string;
  role: "tech" | "admin";
  isActive?: boolean;
};

export type UpdateStaffMemberInput = {
  role?: "tech" | "admin";
  isActive?: boolean;
};

export type EntraUser = {
  id: string;
  email: string;
  displayName: string;
};
