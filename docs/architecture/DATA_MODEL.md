# Data Model

## 1. Design goals

The model must support:
- Notes that exist independently
- user-created Journeys
- one Note/Task linked to multiple Journeys in the future
- persisted chronological history
- explicit event time distinct from creation time
- generic core without career-specific tables
- later custom domain objects/views

## 2. Core entities

### Journey

```ts
type JourneyStatus =
  | 'planning'
  | 'active'
  | 'paused'
  | 'completed'
  | 'archived';

interface Journey {
  id: string;
  title: string;
  description?: string;
  status: JourneyStatus;
  icon?: string;
  coverPath?: string;
  startedAt: string;
  endedAt?: string;
  createdAt: string;
  updatedAt: string;
}
```

### Note

```ts
interface Note {
  id: string;
  title: string;
  bodyMd: string;
  noteType: string; // default 'note'; extensible, not an enum lock-in
  occurredAt?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}
```

`occurredAt` is optional because many Notes are timeless knowledge. When a Note is intentionally logged to Timeline, the link/event supplies chronology.

### Task

```ts
type TaskStatus = 'todo' | 'doing' | 'done' | 'cancelled';

interface Task {
  id: string;
  title: string;
  detailsMd?: string;
  status: TaskStatus;
  dueAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}
```

### JourneyLink

Generic association between a Journey and content.

```ts
type LinkTargetType = 'note' | 'task' | 'event' | 'custom_object';

interface JourneyLink {
  id: string;
  journeyId: string;
  targetType: LinkTargetType;
  targetId: string;
  pinned: boolean;
  createdAt: string;
}
```

MVP only needs note/task links. Keep target type extensible.

### TimelineEvent

```ts
type TimelineImportance = 'compact' | 'normal' | 'milestone';

interface TimelineEvent {
  id: string;
  eventType: string;
  title: string;
  summary?: string;
  reflection?: string;
  occurredAt: string;
  createdAt: string;
  sourceType?: string;
  sourceId?: string;
  importance: TimelineImportance;
  payloadJson?: string;
}
```

Events are linked to Journeys through a join table, not a single `journey_id` field.

## 3. Event examples

### Note logged

```json
{
  "eventType": "note_logged",
  "title": "ROS2 Action",
  "sourceType": "note",
  "sourceId": "note_ros2_action",
  "importance": "normal"
}
```

### Task completed

```json
{
  "eventType": "task_completed",
  "title": "完成 ROS2 Action 学习",
  "sourceType": "task",
  "sourceId": "task_ros2_action",
  "importance": "compact"
}
```

### Journey status change

```json
{
  "eventType": "journey_status_changed",
  "title": "Journey resumed",
  "payloadJson": "{\"from\":\"paused\",\"to\":\"active\"}"
}
```

### Future custom-object state transition

```json
{
  "eventType": "state_changed",
  "title": "ByteDance · VLA Engineer",
  "payloadJson": "{\"field\":\"readiness\",\"from\":\"not_ready\",\"to\":\"ready\"}"
}
```

The event model is generic; the UI renderer may choose a specialized presentation based on `eventType` and payload.

## 4. Why not one giant `items` table?

A universal item table is tempting, but it makes type safety, queries, validation, and migrations harder before the product has proven its real extension needs.

MVP uses explicit core tables + generic linking/event history.

Custom domain objects can be added later once actual use cases are clear.

## 5. Why Timeline events are persisted

If Timeline were only a dynamic sort of current objects, historical meaning would be lost.

Example:

```text
Aug 25  Not Ready
Sep 05  Ready
Sep 12  Applied
```

A current-state-only model would preserve only `Applied`. Persisted events preserve the development story.

## 6. Deletion policy

Prefer soft deletion for Notes during MVP (`deleted_at`) so accidental deletion is recoverable later.

Timeline events should generally remain immutable history. If a source Note is deleted, the event should still retain enough title/summary snapshot to render meaningfully.

## 7. IDs

Use UUID/ULID-style string IDs generated application-side.
Do not rely on auto-increment IDs in domain APIs.

## 8. Time

- Persist timestamps as UTC ISO-8601 strings or equivalent unambiguous UTC representation.
- Render in local timezone.
- `occurred_at` is semantically distinct from `created_at`.

## 9. Future custom view extension

Do not implement before core MVP.

Possible future tables:

```text
custom_view_definitions
custom_object_types
custom_objects
custom_fields
custom_field_values
```

A Job Search template could then define Position/Skill views; a Fitness template could define Workout/Metric views without changing Journey core.
