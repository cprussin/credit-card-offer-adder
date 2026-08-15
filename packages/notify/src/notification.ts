export type Notification = {
  readonly title: string;
  readonly body: string;
};

/** Where a run's outcome goes — a phone, a terminal, a log. */
export type Notifier = {
  readonly send: (notification: Notification) => Promise<void>;
};
