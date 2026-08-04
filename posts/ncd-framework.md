We've been utilising Native Change Detection for a while now, but having recently built a framework for it I felt it was time to fix a long standing issue that has always bugged me. NCD is one of those SailPoint features that sounds solved out of the box and isn't, and you don't find out until you've built your third application specific workflow and watched it fire for every application you have, not just the one that actually changed.

NCD exists to catch access that turns up in a target system without going through SailPoint, someone added straight to an AD group, a role activated directly in Azure, and so on. You define identity triggers, rules that decide what happens when that occurs, per application. Which works fine when you have one application, but scale that up by just one and you'll start to see the problem. Out of the box there's no concept of routing. An NCD event comes in for Application 1, and the identity triggers for all ten applications fire. Why it was designed like this I'm not sure, but that's the way it is.

If your Workday termination logic and your Entra PIM logic and your database account logic are all evaluating on every single NCD event regardless of source, you're running a load of irrelevant rule evaluations that simply don't need to run. And yes, you can add a simple if statement at the start of each application specific rule, but it doesn't feel right firing off ten rules just for them to determine they don't need to run. But that's not the only problem. Each identity trigger that fires adds an identity event into the user's identity cube. So for what should be a single identity event in the events tab, you get nine, and you have no idea which one is genuine.

## Building an entry point

So the fix was to stop treating each application's NCD workflow as its own listener and instead put one workflow in front of all of them.

I built a custom entry point workflow that receives every NCD event, regardless of source. It calls a rule that inspects the event, works out which application it actually came from, and looks that up against a custom configuration object that maps applications to their specific workflow. Only the workflow for the application that actually changed gets launched. Everything else stays idle until it's their turn.

The configuration object sounds like a small piece, but it's important. Without it, adding a new application means writing routing logic into an already complex workflow and hoping you didn't break the routing for the other nine. With it, onboarding a new application is an entry in a config object and a new application specific workflow that plugs into the same entry point. I wrote up the pattern as a framework the rest of the team could follow, specifically so the next person adding an application wasn't reverse engineering how the routing worked from scratch.

Now, looking back to those identity events. The out of the box audit events don't always give you great information, and if the entitlements involved don't have a user friendly value, the display name isn't resolved, so you're stuck trying to figure out what a 128 character string actually means. I wanted a clear view of what happened, how it happened, and what we did about it. I built a custom function that generates a proper audit entry, application, source, outcome, and critically, the cause of the NCD event itself. When something needs investigating six months later, being able to see that a user was dropped into a SailPoint permission and the system removed them as a result is a lot more useful than a generic audit line telling you a workflow ran.

## What actually happens once an event lands

Routing solves the needless rules running and the audit event spam. It doesn't solve what you do with the event once it's correctly landed on the right workflow, and that differs a lot by application.

I won't bore you with the details of all our application specific handling, but Entra is an interesting one. Users added directly to Conditional Access groups, or added into PIM roles outside of SailPoint, I've configured to both raise an NCD. PIM needed extra handling though. SailPoint's internal handling of PIM activation events isn't straightforward, if you're an eligible member of a PIM role and you PIM up, you're moved into the active members, and SailPoint sees that as an NCD. So I had to build some funky logic to account for this. I won't detail it all here, partly because I don't want to relive the pain, but also because it doesn't make for great reading. If you're curious or want to replicate it, I'm happy to share.

Reversal of what caused the event runs on a criticality based timer, five, fourteen, or twenty-one days depending on how sensitive the application is. Criticality is set inside each application specific workflow, with the actual thresholds pulled from the same configuration object doing the routing. For applications that raise a work item, if nobody's approved the access within the window, the action is reversed. I use the term reversed rather than revoked deliberately, because if you're removed from a group then reversal of that action is to add you back in, and that distinction matters for our Conditional Access inclusion groups.

## Restricting who can request what

This isn't NCD, but it covers the opposite problem. NCD solves what happens when access is added outside of SailPoint. It doesn't control who should be allowed to request certain access in the first place.

In theory this is solved by approval gates, but that relies on a human making the right decision every time, and why clog up their approval queue if you can catch it before it gets there. Most roles should be requestable by anyone, but some are worth locking down to certain areas, teams, or user types.

I added a custom bundle attribute to hold a constraint, for example `type=HR Managed @and department=finance`, and a rule evaluated at request time within LCM provisioning that checks the requester's identity attributes against it. If the attributes match, the request proceeds as normal. If they don't, it's blocked before it ever becomes a work item for an approver to see.

The attribute lives on the role itself, not scattered across separate policy objects, so anyone looking at the role can see its restriction in the same place they see everything else about it. And because it evaluates against identity attributes rather than a static list of allowed requesters, it doesn't need maintaining as people move around.

It's a small piece next to the NCD framework, but it closes a gap the framework can't. NCD governs access that appears outside SailPoint. This governs who's even allowed to ask for it inside SailPoint. Between the two, there's a much smaller gap for the wrong access to slip through, whichever direction it comes from.

## Where this leaves us

None of this is really that complicated in isolation, although some of the code was. An entry point pattern to stop redundant workflow execution isn't a new idea, and neither is attribute based request restriction. What made it worth building was that IIQ doesn't give you either out of the box, and the simple path, one NCD workflow per application wired up independently, scales poorly.

The key pattern here is just building things that scale.
