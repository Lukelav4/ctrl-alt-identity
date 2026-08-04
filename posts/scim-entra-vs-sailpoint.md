This is something that comes up semi-regularly. Enough times that I've decided a blog post is due: an application supports SCIM. Entra can do SCIM. SailPoint can do SCIM. Someone asks the reasonable question: why would we build a SailPoint connector when Entra will do it for us with about four clicks and no development effort?

It's a fair question, and the truth is that both of them work. Users get created. Users get removed. If your only measure of success is "did the account appear", either route passes, and Entra is a lot quicker to set up, so why not just go with that?

But that isn't the question. The question is what you lose, and how you find out about it, or really how you don't...

Let's lay out what we're actually comparing, because once you understand the detail, it makes it easier to understand the why.

**Option one.** SailPoint connects to the application directly. It creates the account, assigns the entitlements, and aggregates the result back.

**Option two.** SailPoint manages an Entra group. Entra sees the membership change and makes the SCIM call to the application. SailPoint's involvement ends at the group.

Both are "SCIM provisioning". But they are not the same thing at all.

## You cannot govern what you cannot see

In option two, SailPoint knows exactly one fact: this identity is a member of that group. That's it. That's all it knows.

It doesn't know whether the SCIM call succeeded. It doesn't know whether the account exists in the target app. It doesn't know what that account can actually do once it's in there.

So when someone asks SailPoint who has access to the application, SailPoint answers confidently, but it doesn't really know. It's telling you who is in a group. Whether that group membership turned into working access is something it has no way of knowing and no way of checking.

Any errors or misconfigurations in Entra's SCIM connector never surface in SailPoint. Your governance reporting isn't wrong exactly, it's just answering the wrong question.

## The failure modes are not equivalent

This is the part I keep coming back to, because it's the bit that should actually worry you, and I've seen a live example of it.

Both routes will fail sometimes. Connectors break, credentials expire, target APIs change, someone renames an attribute, that's totally normal. What matters is what is surfaced or what isn't.

When a SailPoint connector operation fails, the next aggregation pulls the real state back onto the identity cube. The account still shows the access it actually has. SailPoint's picture stays accurate because it keeps going back and looking. The failure is visible and your data is still right.

When Entra's SCIM provisioning fails, Entra retries. And retries. It will keep retrying more or less forever. If the underlying error persists and nobody is watching that provisioning log, the user keeps their access in the target application, while SailPoint sits there believing they don't have it. And even worse, in the live example I saw, provisioning was turned off in an attempt to fix it, at which point all retries stopped, and when the issue was resolved the only way to figure out who should have what was to do a full reconciliation of the system.

That's the difference that is the issue. One route fails loudly and leaves your records correct. The other fails silently and leaves your records confidently wrong.

A system that knows it's broken is fine, at least we still have an accurate picture. A system that is broken and reports everything is sunshine and rainbows is a huge issue.

## Deprovisioning blind spots

Provisioning failures are irritating. Deprovisioning failures are the ones that end up in front of your auditors.

If Entra is making the SCIM calls, there is no loopback confirming the account in the target app was actually removed or disabled. SailPoint removed the group membership, so as far as it's concerned the job is done and the leaver is clean.

But it never verified anything. It saw a group membership change, not the end result.

Which means SailPoint cannot honestly certify or confirm that access was revoked. It can confidently state that it asked for it to be revoked. But those are very different statements, and only one of them is worth anything when an auditor asks you to prove a leaver had their access revoked on their final day.

## What your certifications actually show

Here's a related problem that gets noticed much later, usually during a certification campaign.

Go direct with a connector and SailPoint aggregates the real entitlements. The roles, the permission sets, the data scopes, whatever that particular application uses. Your certifier sees via the role what the person can genuinely do.

Go via Entra and your certifier sees a group name on the role. That's all there is to show them.

So a manager gets a certification asking them to confirm that one of their team should still be in a group whose name tells them very little, and they have no idea what it grants, because that name is the entire extent of the information available. They approve it, because what else are they going to do.

## Orphan accounts

There's one more thing that only the direct connector gives you, and it's easy to miss because it isn't about provisioning at all.

Aggregation finds accounts created outside of the correct process.

Local admin accounts made during implementation, service accounts created by a project team, someone who was set up manually because they needed access urgently and the process was too slow.

Direct connector, and those all appear in SailPoint and an alert is raised via Native Change Detection.

Via Entra, none of them exist as far as your governance tooling is concerned. Entra SCIM only knows about the things Entra SCIM created. Everything else in that application is invisible, and invisible unmanaged accounts are how a lot of the horror stories start.

## Expanded attack surface

If Entra is the thing making the SCIM calls, then group membership in Entra is the thing that grants access to the application.

Which means anyone who can modify that group membership can grant access to the application.

That's a much wider set of people than you'd assume once you actually go and check. Entra administrators. Anyone with a role that includes group write permissions. Any service principal holding `Group.ReadWrite.All`.

None of that goes anywhere near SailPoint. No request, no approval, no policy evaluation, no record beyond an Entra audit log that nobody is reading.

You've built a careful access request process with approvals and SoD checks and certifications, and then left an easy to access side door that bypasses all of it.

## Where the evidence lives

A smaller point, but one that costs real time.

Go direct, and the request, the approval, the provisioning event and the resulting entitlement are all in one system with one timeline. An auditor asks how someone got access and you show them one screen.

Go via Entra, and half the story is in SailPoint and half is in Entra. You are now correlating two systems by timestamp to reconstruct a single event, hoping the retention periods line up.

## Where this leaves us

Both routes provision. Only one of them governs.

Entra SCIM gives you an action. SailPoint's connector gives you an action, plus confirmation it worked, plus the state it produced, plus everything else in that application you didn't put there.

Knowing who has what is critical to governing your environments. And yes it may take longer to set up, but the security of your environments and organisation is undeniably more important.
