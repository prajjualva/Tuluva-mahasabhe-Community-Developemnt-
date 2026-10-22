"use client";

import { FormEvent, useEffect, useState } from "react";
import { readMemberRecord } from "./member-record-loader";

type Notification = {
  externalId: string;
  type: string;
  channel: string;
  title: string;
  body: string;
  relatedExternalId: string | null;
  createdAt: string;
  readAt: string | null;
};

type News = {
  externalId: string;
  title: string;
  body: string;
  audience: string;
  status: string;
  publishedAt: string | null;
};

type NewsComment = {
  externalId: string;
  authorName: string;
  body: string;
  createdAt: string;
};

async function readJson(response: Response) {
  return (await response.json()) as { error?: string };
}

/** Safe in-app inbox and news discussion. Server routes own every access decision. */
export function MemberCommunications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [news, setNews] = useState<News[]>([]);
  const [comments, setComments] = useState<Record<string, NewsComment[]>>({});
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState("");
  const [openedNotification, setOpenedNotification] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState<string[]>([]);

  const load = async () => {
    setLoading(true);
    const [inboxResponse, newsResponse] = await Promise.all([
      readMemberRecord<{ notifications?: Notification[]; unreadCount?: number }>(
        "/api/member/notifications?limit=50",
      ),
      readMemberRecord<{ news?: News[] }>("/api/member/news"),
    ]);
    if (inboxResponse.ok) {
      const data = inboxResponse.data;
      setNotifications(data.notifications ?? []);
      setUnreadCount(data.unreadCount ?? 0);
    }
    if (newsResponse.ok) {
      const data = newsResponse.data;
      setNews(data.news ?? []);
    }
    setUnavailable([...(inboxResponse.ok ? [] : ["inbox"]), ...(newsResponse.ok ? [] : ["news"])]);
    setLoading(false);
  };

  useEffect(() => {
    void load().catch(() => setMessage("Your inbox is temporarily unavailable. Please try again."));
  }, []);

  const markRead = async (notificationExternalId: string) => {
    setWorking(`read:${notificationExternalId}`);
    try {
      const response = await fetch(
        `/api/member/notifications/${encodeURIComponent(notificationExternalId)}/read`,
        { method: "POST" },
      );
      const data = await readJson(response);
      if (!response.ok) throw new Error(data.error ?? "Notification could not be updated");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Notification could not be updated");
    } finally {
      setWorking("");
    }
  };

  const markAllRead = async () => {
    setWorking("read-all");
    try {
      const response = await fetch("/api/member/notifications/read-all", { method: "POST" });
      const data = await readJson(response);
      if (!response.ok) throw new Error(data.error ?? "Notifications could not be updated");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Notifications could not be updated");
    } finally {
      setWorking("");
    }
  };

  const loadComments = async (newsExternalId: string) => {
    setWorking(`comments:${newsExternalId}`);
    try {
      const response = await fetch(
        `/api/member/news/${encodeURIComponent(newsExternalId)}/comments`,
      );
      const data = (await response.json()) as { comments?: NewsComment[]; error?: string };
      if (!response.ok) throw new Error(data.error ?? "News comments are unavailable");
      setComments((current) => ({ ...current, [newsExternalId]: data.comments ?? [] }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "News comments are unavailable");
    } finally {
      setWorking("");
    }
  };

  const postComment = async (event: FormEvent<HTMLFormElement>, newsExternalId: string) => {
    event.preventDefault();
    const body = (commentDrafts[newsExternalId] ?? "").trim();
    if (!body) return;
    setWorking(`post:${newsExternalId}`);
    try {
      const response = await fetch(
        `/api/member/news/${encodeURIComponent(newsExternalId)}/comments`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ body }),
        },
      );
      const data = await readJson(response);
      if (!response.ok) throw new Error(data.error ?? "News comment could not be added");
      setCommentDrafts((current) => ({ ...current, [newsExternalId]: "" }));
      await loadComments(newsExternalId);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "News comment could not be added");
    } finally {
      setWorking("");
    }
  };

  return (
    <>
      <article aria-label="Notifications">
        <h2>Notifications {unreadCount ? `(${unreadCount} unread)` : ""}</h2>
        {message && <p role="status">{message}</p>}
        {unavailable.length > 0 && (
          <p role="status">
            Some updates are unavailable.{" "}
            <button disabled={loading || Boolean(working)} onClick={() => void load()}>
              Retry loading updates
            </button>
          </p>
        )}
        {!unavailable.includes("inbox") && unreadCount > 0 && (
          <button disabled={working === "read-all"} onClick={() => void markAllRead()}>
            {working === "read-all" ? "Updating…" : "Mark all as read"}
          </button>
        )}
        {unavailable.includes("inbox") ? (
          <p>Your inbox could not be loaded. Please retry.</p>
        ) : notifications.length ? (
          notifications.map((notification) => (
            <section key={notification.externalId} className="comment">
              <p>
                <button
                  className="notification-open"
                  aria-expanded={openedNotification === notification.externalId}
                  aria-controls={`notification-${notification.externalId}`}
                  onClick={() => {
                    setOpenedNotification(
                      openedNotification === notification.externalId
                        ? null
                        : notification.externalId,
                    );
                    if (!notification.readAt) void markRead(notification.externalId);
                  }}
                >
                  {notification.title} <span aria-hidden="true">→</span>
                </button>
                {!notification.readAt && " · Unread"}
              </p>
              <div
                id={`notification-${notification.externalId}`}
                hidden={openedNotification !== notification.externalId}
              >
                <p className="notification-content">{notification.body}</p>
                {notification.type === "COMMUNITY_NEWS" &&
                  news.some((item) => item.externalId === notification.relatedExternalId) && (
                    <a href={`#news-${notification.relatedExternalId}`}>
                      Read full community news →
                    </a>
                  )}
              </div>
              <small>{new Date(notification.createdAt).toLocaleString()}</small>
              {!notification.readAt && (
                <p>
                  <button
                    disabled={working === `read:${notification.externalId}`}
                    onClick={() => void markRead(notification.externalId)}
                  >
                    Mark as read
                  </button>
                </p>
              )}
            </section>
          ))
        ) : (
          <p>{loading ? "Loading notifications…" : "No notifications yet."}</p>
        )}
      </article>

      <article aria-label="Community news">
        <h2>Community news</h2>
        {unavailable.includes("news") ? (
          <p>Community news could not be loaded. Please retry.</p>
        ) : news.length ? (
          news.map((item) => (
            <section id={`news-${item.externalId}`} key={item.externalId} className="comment">
              <h3>{item.title}</h3>
              <p className="notification-content">{item.body}</p>
              <small>
                Published {item.publishedAt ? new Date(item.publishedAt).toLocaleString() : "—"}
              </small>
              <p>
                <button
                  disabled={working === `comments:${item.externalId}`}
                  onClick={() => void loadComments(item.externalId)}
                >
                  {working === `comments:${item.externalId}` ? "Loading…" : "Show comments"}
                </button>
              </p>
              {comments[item.externalId]?.map((comment) => (
                <section className="comment" key={comment.externalId}>
                  <strong>{comment.authorName}</strong>
                  <p>{comment.body}</p>
                  <small>{new Date(comment.createdAt).toLocaleString()}</small>
                </section>
              ))}
              <form onSubmit={(event) => void postComment(event, item.externalId)}>
                <label htmlFor={`comment-${item.externalId}`}>Add a respectful comment</label>
                <textarea
                  id={`comment-${item.externalId}`}
                  maxLength={2000}
                  value={commentDrafts[item.externalId] ?? ""}
                  onChange={(event) =>
                    setCommentDrafts((current) => ({
                      ...current,
                      [item.externalId]: event.target.value,
                    }))
                  }
                />
                <button disabled={working === `post:${item.externalId}`} type="submit">
                  {working === `post:${item.externalId}` ? "Posting…" : "Post comment"}
                </button>
              </form>
            </section>
          ))
        ) : (
          <p>
            {loading
              ? "Loading community news…"
              : "No community news is available for your membership yet."}
          </p>
        )}
      </article>
    </>
  );
}
