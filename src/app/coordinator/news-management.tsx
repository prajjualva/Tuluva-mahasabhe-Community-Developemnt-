"use client";

import { useEffect, useState } from "react";

type News = {
  externalId: string;
  title: string;
  body: string;
  status: "DRAFT" | "PUBLISHED" | "PENDING_APPROVAL" | "REJECTED" | "ARCHIVED";
  publishedAt: string | null;
};

type Comment = {
  externalId: string;
  authorName: string;
  body: string;
  status: string;
  createdAt: string;
};

export function CoordinatorNewsManagement() {
  const [news, setNews] = useState<News[]>([]);
  const [comments, setComments] = useState<Record<string, Comment[]>>({});
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [publish, setPublish] = useState(false);
  const [audience, setAudience] = useState("COORDINATOR_MEMBERS");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState("");

  const load = async () => {
    const response = await fetch("/api/coordinator/news");
    const data = (await response.json()) as { news?: News[]; error?: string };
    if (response.ok) setNews(data.news ?? []);
    else setMessage(data.error ?? "Coordinator news is unavailable");
  };

  useEffect(() => {
    void load();
  }, []);

  const createNews = async () => {
    setWorking("create");
    try {
      const response = await fetch(
        editingId ? `/api/coordinator/news/${editingId}` : "/api/coordinator/news",
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(editingId ? { title, body } : { title, body, publish, audience }),
        },
      );
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Coordinator news could not be created");
      setTitle("");
      setBody("");
      setMessage(
        editingId
          ? "Draft updated."
          : audience === "FOUNDATION_WIDE"
            ? "Foundation-wide update sent for Admin approval."
            : publish
              ? "News published for your assigned members."
              : "News draft saved.",
      );
      setEditingId(null);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Coordinator news could not be created");
    } finally {
      setWorking("");
    }
  };

  const publishDraft = async (newsExternalId: string) => {
    setWorking(`publish:${newsExternalId}`);
    try {
      const response = await fetch(
        `/api/coordinator/news/${encodeURIComponent(newsExternalId)}/publish`,
        { method: "POST" },
      );
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "News could not be published");
      setMessage("News published for your assigned members.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "News could not be published");
    } finally {
      setWorking("");
    }
  };

  const loadComments = async (newsExternalId: string) => {
    setWorking(`comments:${newsExternalId}`);
    try {
      const response = await fetch(
        `/api/coordinator/news/${encodeURIComponent(newsExternalId)}/comments`,
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

  const moderate = async (newsExternalId: string, commentExternalId: string) => {
    const reason = (reasons[commentExternalId] ?? "").trim();
    if (reason.length < 3) {
      setMessage("A moderation reason of at least three characters is required.");
      return;
    }
    setWorking(`moderate:${commentExternalId}`);
    try {
      const response = await fetch(
        `/api/coordinator/news/${encodeURIComponent(newsExternalId)}/comments/${encodeURIComponent(commentExternalId)}/moderate`,
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
      <h2>Member news</h2>
      <p>Publish assigned-member updates, or submit Foundation-wide news for Admin approval.</p>
      {!editingId && (
        <label>
          Audience
          <select value={audience} onChange={(event) => setAudience(event.target.value)}>
            <option value="COORDINATOR_MEMBERS">My assigned members</option>
            <option value="FOUNDATION_WIDE">Foundation-wide (Admin approval required)</option>
          </select>
        </label>
      )}
      {message && <p role="status">{message}</p>}
      <label htmlFor="coordinator-news-title">Title</label>
      <input
        id="coordinator-news-title"
        maxLength={180}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
      />
      <label htmlFor="coordinator-news-body">Update</label>
      <textarea
        id="coordinator-news-body"
        maxLength={10000}
        value={body}
        onChange={(event) => setBody(event.target.value)}
      />
      <label>
        <input
          checked={publish}
          disabled={Boolean(editingId) || audience === "FOUNDATION_WIDE"}
          type="checkbox"
          onChange={(event) => setPublish(event.target.checked)}
        />{" "}
        Publish now to my assigned members
      </label>
      <p>
        <button
          disabled={working === "create" || title.trim().length < 3 || body.trim().length < 3}
          onClick={() => void createNews()}
        >
          {working === "create"
            ? "Saving…"
            : editingId
              ? "Save draft changes"
              : audience === "FOUNDATION_WIDE"
                ? "Submit for Admin approval"
                : publish
                  ? "Publish update"
                  : "Save draft"}
        </button>
        {editingId && (
          <button
            onClick={() => {
              setEditingId(null);
              setTitle("");
              setBody("");
            }}
          >
            Cancel editing
          </button>
        )}
      </p>
      {news.length ? (
        news.map((item) => (
          <article key={item.externalId}>
            <h3>{item.title}</h3>
            <p>{item.body}</p>
            <p>
              Status: <strong>{item.status}</strong>
            </p>
            {item.status === "DRAFT" && (
              <>
                <button
                  onClick={() => {
                    setEditingId(item.externalId);
                    setTitle(item.title);
                    setBody(item.body);
                  }}
                >
                  Edit draft
                </button>
                <button
                  disabled={working === `publish:${item.externalId}`}
                  onClick={() => void publishDraft(item.externalId)}
                >
                  Publish draft
                </button>
              </>
            )}
            {item.status === "PUBLISHED" && (
              <>
                <button
                  disabled={working === `comments:${item.externalId}`}
                  onClick={() => void loadComments(item.externalId)}
                >
                  Moderate comments
                </button>
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
                      onClick={() => void moderate(item.externalId, comment.externalId)}
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
        <p>No Coordinator news has been created yet.</p>
      )}
    </section>
  );
}
