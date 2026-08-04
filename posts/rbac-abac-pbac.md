At the start of 2026, under the vision of the newly formed SailPoint engineering function, I set myself the task of finally getting RBAC (or team based access) set up and working. I'd never really considered the different acronyms of what I would be implementing. It all just fell under the RBAC banner to me, and really, they all end up in the same place. Someone gets access to something. The user doesn't care which acronym got them there. Neither does the auditor really, as long as you can explain it.

But the differences do matter once you try to start building it, because they're not three competing ideas. They're three answers to the same question: what does SailPoint need to know at the moment it decides to give this person access?

RBAC needs to know who you are in the organisation. ABAC needs to know facts about you. PBAC needs a rule written down somewhere that can be managed. That's it. So: who are you, how can I determine that, and how are we managing this configuration? That's how I view it anyway, and how I plan on implementing it. Ask five different people or read five different blog posts and you'll get varying answers. Why the consensus on this seems to be so split is a topic for another post.

So here's what I'm actually planning to do with them.

## The attribute problem

The goal is team based access. You join a team, you get what you need. No manual request, no approval gate, no waiting around, you get the access on day one.

Simple enough until you try to find the attribute that defines a team.

Department? Far too broad. Ours contain people doing completely different jobs. Job title? Inconsistent within teams. Location? Means very little in our post-Covid era.

Manager is the closest thing you normally have. It's accurate, it's maintained, and it actually reflects who works together day to day. But a reporting line isn't a job description, and what happens when a manager changes role?

So there is no single golden attribute. There isn't one hiding somewhere we haven't looked yet (and trust me, I've trawled the data). But there are a couple of attributes that come up as good contenders. Team code for us being one of them.

The workaround is to stop letting perfect be the enemy of good. Use team code as the anchor, then let the manager decide which job title codes within that team the access should apply to. Tight control from the team code, flexibility from the job title codes.

Once you've got that defined, that's the ABAC side of things. The next step is defining what roles those users actually get, and that moves us onto the next acronym: RBAC.

## Pushing the onus onto the business

Doing this for one team is easy. Scaling it across the entire business and building it for hundreds of teams is not. And it doesn't solve the problem for new teams or functions. We don't want to burden our operational team with a manual process they have to maintain forever. So can we push the onus of team role setup onto the business?

What if we build a GUI within SailPoint that managers and team leaders use to create a team role. It presents them with their direct reports, their job title codes, their roles, and what percentage of the team holds each of those roles. They pick which job title codes this new team role should apply to, and which roles should be included.

The role percentage is the key piece. A manager who couldn't tell you what any of these roles actually do can absolutely tell you that if 94% of the team has something, the other 6% are probably missing it. The data makes the decision obvious without needing them to understand each role.

They tick the roles that should form part of the team role. They submit. Then a workflow does the hard work:

- Each role's approver group gets a work item asking them to confirm they're happy for that role to sit inside this team role
- There's a time limit on it, so one unresponsive approver can't stall the whole thing indefinitely
- Once everything is either approved or timed out, the approved roles are bundled into a team role
- The team role is assigned to every current member of that team
- And to everyone who joins that team from then on, automatically

## The hidden benefit

And there's a hidden trick here! Direct reports naturally accumulate access. Every time a new team member starts, the path of least resistance is to clone an existing member's access and request all of it. That compounds the accumulation problem, and it only gets worse over time.

Team access forces managers to review the core access their team actually needs, without them ever realising that's what they're doing. And the scope never creeps. It's static until the manager makes a conscious decision to add to it.

## Getting business buy in

Getting the logic right is difficult. Getting business buy in is significantly harder.

What we're really asking for is this: role owners give up per request approval for their role, in exchange for it being provisioned automatically as part of a team role. From their side that reads as "please give up control", and that's a difficult sell. If you've spent years being the gate on an entitlement, someone rocking up to say the gate is now automatic can, on the face of it, sound concerning.

So what we need is an education campaign, and it has to run before any of this goes live.

What helps is being direct about the trade. They aren't losing oversight, they're moving it. They approve once for a defined team, instead of rubber stamping the same request forty times a year and eventually approving it on autopilot anyway. They can still see who holds it, and they still get it back at recertification.

Spending three months on those conversations and getting people on board is going to be easier than switching it on quietly and spending the next year defending it. There's the saying that it's easier to ask for forgiveness than permission, but in the world of security that's a dangerous game to play, and almost never the right answer.

## And then there's PBAC

Two down, one to go.

So what happens when job titles change, or the team's needs shift, or a role needs swapping out? That's where I see PBAC coming in.

The team role definition, which job title codes it covers and which roles it grants, is itself a policy. It lives in SailPoint rather than being hardcoded into a rule somewhere, and it can be modified by the team manager at any point through a second GUI, with approval gates back to the underlying role owners for anything being added.

Now, I'm well aware some people will read that and say it isn't PBAC at all, it's just configuration management with a nice front end. There's no runtime policy decision point, no engine evaluating a rule at the moment of the request. And that's a fair challenge.

I don't think it matters much, and this is my blog anyway, so what I say goes, right? The thing PBAC is actually meant to give you is a rule that lives outside the application, is authored in language the business understands, is versioned, and is auditable. That's exactly what this does give us. Whether the evaluation happens at request time or at policy change time is an implementation detail, not a conceptual difference. Our access decisions don't need to be re-evaluated on every request. They need to be correct, owned, and explainable.

Storing the configuration in SailPoint makes it far easier to manage, but it also makes your life easier with auditors. If you can clearly demonstrate how team access is determined (ABAC) and who signed off the underlying roles (RBAC), then your face off to audit is a much less challenging conversation.

## Joiners, movers and manager changes

It wouldn't be an identity blog without a mention of JML.

Joiners are the easy half. Movers are where team based access either proves itself or transforms into an access creep problem and an auditor's nightmare.

When someone moves out of a team, the team role goes with them. That has to be automatic and it has to be decisive, because "they might still need it for handover" is exactly how people end up carrying access from three jobs ago. So we build this into our existing mover process: a step to evaluate team access, remove the old, apply the new.

The manager change is the more interesting challenge, because a reporting line can change without the job changing at all. Reorgs, someone's manager leaving, a team shuffled under a different lead. The person is doing the same work on Monday as they did on Friday, but suddenly their manager has changed.

This is exactly why the attributes you choose matter so much. We're fortunate that our HR source contains a team code, so we can rely on that rather than building convoluted logic around manager. You may not be as lucky.

But that doesn't mean we can ignore manager changes. A new manager taking on a team needs to be aware of their responsibility, and ownership has to move with them. So when a manager takes on a new team, a notification is triggered telling them which team role they now own, what it provisions, and what their responsibilities are.

## Where this leaves us

RBAC to define who you are in the organisation.

ABAC to determine that automatically.

PBAC to manage the configuration behind it.

And two GUIs. One to build a team role, one to maintain it. They're the least architectural part of the whole thing, and probably the part that decides whether any of it actually works.

The model is the fun part. Getting hundreds of managers to tell us what their teams need, now and going forward, is the hard part. So let's enable the business and give them the power to do that themselves.

Just to sign this off, this is all part of my design. The implementation follows later this year, at which point I'll do a follow up post about how it actually ended up working...
