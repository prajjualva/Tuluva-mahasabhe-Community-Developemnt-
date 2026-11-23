import { PublicHeader } from "../components/public-header";
export default function CommunityRulesPage() {
  return (
    <>
      <PublicHeader />
      <main className="policy-page">
        <h1>Community rules</h1>
        <p>
          Keep comments respectful, truthful and relevant to the community update or condolence
          notice.
        </p>
        <p>
          Do not post harassment, threats, hate speech, sexual content, nudity, graphic violence,
          scams, spam, or another person’s private contact, identity, financial or medical
          information.
        </p>
        <p>
          Use Report comment to notify Foundation Admin privately. Reports are reviewed; reporting
          does not automatically remove another person’s message. Moderators may remove content that
          violates these rules and record the reason.
        </p>
        <p>
          Block author hides that person’s comments while you are signed in and hides your comments
          from them. Manage blocked authors in the comments area to unblock. Blocking does not
          remove public comments from the internet or hide them from signed-out visitors.
        </p>
        <p>
          For safety concerns or privacy requests, contact{" "}
          <a href="mailto:tuluworld@gmail.com">tuluworld@gmail.com</a>.
        </p>
      </main>
    </>
  );
}
