export type ApiErrorPayload = {
  error: string;
  message: string;
  details?: unknown;
};

export type ApiSuccessPayload<T> = {
  data: T;
};
