"use client";

import { useEffect, useState } from "react";

type News = {
  externalId: string;
  title: string;
  body: string;
  audience: string;
  status: "DRAFT" | "PENDING_APPROVAL" | "PUBLISHED" | "REJECTED" | "ARCHIVED";
  publishedAt: string | null;
  rejectionReason: string | null;
};

type Comment = {
  externalId: string;
  authorName: string;
  body: string;
  status: string;
  createdAt: string;
};

export function AdminNewsQueue() {
  const [news, setNews] = useState<News[]>([]);
  const [comments, setComments] = useState<Record<string, Comment[]>>({});
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState("");

  const load = async () => {
    const response = await fetch("/api/admin/news");
    const data = (await response.json()) as { news?: News[]; error?: string };
    if (response.ok) setNews(data.news ?? []);
    else setMessage(data.error ?? "Foundation news is unavailable");
  };
  useEffect(() => {
    void load();
  }, []);

  const create = async () => {
    setWorking("create");
    try {
      const response = await fetch("/api/admin/news", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, body }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Foundation news could not be submitted");
      setTitle("");
      setBody("");
      setMessage("Foundation-wide news submitted for approval.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Foundation news could not be submitted");
    } finally {
      setWorking("");
    }
  };

  const action = async (newsExternalId: string, actionName: "approve" | "reject" | "archive") => {
    const reason = (reasons[newsExternalId] ?? "").trim();
    if (actionName !== "approve" && reason.length < 3) {
      setMessage("A reason of at least three characters is required.");
      return;
    }
    setWorking(`${actionName}:${newsExternalId}`);
    try {
      const response = await fetch(
        `/api/admin/news/${encodeURIComponent(newsExternalId)}/${actionName}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: actionName === "approve" ? undefined : JSON.stringify({ reason }),
        },
      );
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "News action could not be completed");
      setMessage(
        actionName === "approve"
          ? "Foundation news approved and published."
          : actionName === "reject"
            ? "Foundation news rejected."
            : "Community news archived.",
      );
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "News action could not be completed");
    } finally {
      setWorking("");
    }
  };

  const loadComments = async (newsExternalId: string) => {
    setWorking(`comments:${newsExternalId}`);
    try {
      const response = await fetch(
        `/api/admin/news/${encodeURIComponent(newsExternalId)}/comments`,
      );
      const data = (await response.json()) as { comments?: Comment[]; error?: string };
      if (!response.ok) throw new Error(data.error ?? "News comments are unavailable");
      setComments((current) => ({ ...current, [newsExternalId]: data.comments ?? [] }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "News comments are unavailable");
    } finally {
      setWorking("");
    }
  };

  const moderateComment = async (newsExternalId: string, commentExternalId: string) => {
    const reason = (reasons[commentExternalId] ?? "").trim();
    if (reason.length < 3) {
      setMessage("A moderation reason of at least three characters is required.");
      return;
    }
    setWorking(`moderate:${commentExternalId}`);
    try {
      const response = await fetch(
        `/api/admin/news/${encodeURIComponent(newsExternalId)}/comments/${encodeURIComponent(commentExternalId)}/moderate`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ reason }),
        },
      );
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Comment could not be moderated");
      setMessage("Comment moderated and audit-recorded.");
      await loadComments(newsExternalId);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Comment could not be moderated");
    } finally {
      setWorking("");
    }
  };

  return (
    <section>
      <h2>Foundation-wide news approval</h2>
      <p>Foundation-wide news enters this approval queue before it is published.</p>
      {message && <p role="status">{message}</p>}
      <label htmlFor="foundation-news-title">Title</label>
      <input
        id="foundation-news-title"
        maxLength={180}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
      />
      <label htmlFor="foundation-news-body">Update</label>
      <textarea
        id="foundation-news-body"
        maxLength={10000}
        value={body}
        onChange={(event) => setBody(event.target.value)}
      />
      <p>
        <button
          disabled={working === "create" || title.trim().length < 3 || body.trim().length < 3}
          onClick={() => void create()}
        >
          {working === "create" ? "Submitting…" : "Submit Foundation news"}
        </button>
      </p>
      {news.length ? (
        news.map((item) => (
          <article key={item.externalId}>
            <h3>{item.title}</h3>
            <p>{item.body}</p>
            <p>
              Status: <strong>{item.status}</strong>
            </p>
            {(item.status === "PENDING_APPROVAL" || item.status === "PUBLISHED") && (
              <textarea
                aria-label={`Reason for ${item.title}`}
                maxLength={1000}
                placeholder="Reason required for rejection or archive"
                value={reasons[item.externalId] ?? ""}
                onChange={(event) =>
                  setReasons((current) => ({ ...current, [item.externalId]: event.target.value }))
                }
              />
            )}
            {item.status === "PENDING_APPROVAL" && (
              <p>
                <button
                  disabled={working === `approve:${item.externalId}`}
                  onClick={() => void action(item.externalId, "approve")}
                >
                  Approve and publish
                </button>
                <button
                  disabled={working === `reject:${item.externalId}`}
                  onClick={() => void action(item.externalId, "reject")}
                >
                  Reject
                </button>
              </p>
            )}
            {item.status === "PUBLISHED" && (
              <>
                <p>
                  <button
                    disabled={working === `archive:${item.externalId}`}
                    onClick={() => void action(item.externalId, "archive")}
                  >
                    Archive
                  </button>
                  <button
                    disabled={working === `comments:${item.externalId}`}
                    onClick={() => void loadComments(item.externalId)}
                  >
                    Moderate comments
                  </button>
                </p>
                {comments[item.externalId]?.map((comment) => (
                  <section className="comment" key={comment.externalId}>
                    <strong>{comment.authorName}</strong>
                    <p>{comment.body}</p>
                    <textarea
                      aria-label={`Moderation reason for ${comment.authorName}`}
                      maxLength={1000}
                      value={reasons[comment.externalId] ?? ""}
                      onChange={(event) =>
                        setReasons((current) => ({
                          ...current,
                          [comment.externalId]: event.target.value,
                        }))
                      }
                    />
                    <button
                      disabled={
                        working === `moderate:${comment.externalId}` ||
                        comment.status === "MODERATED"
                      }
                      onClick={() => void moderateComment(item.externalId, comment.externalId)}
                    >
                      {comment.status === "MODERATED" ? "Already moderated" : "Moderate comment"}
                    </button>
                  </section>
                ))}
              </>
            )}
          </article>
        ))
      ) : (
        <p>No Foundation-wide news has been submitted.</p>
      )}
    </section>
  );
}
