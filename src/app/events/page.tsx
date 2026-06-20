import { EventsClient } from "./EventsClient";

export default function EventsPage() {
  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden">
      <EventsClient />
    </div>
  );
}
