# `berichten-melding-service`
Microservice responsible for processing an incoming `schema:Message` from a vendor and storing it in loket.

For more context refer to: [Berichtencentru-API](https://lblod.github.io/pages-vendors/#/docs/berichtencentrum-api)

## Flow Description
### High Level Overview
1. **Initial Submission:**
   A vendor initiates a submission of a `schema:Message` via a POST call to this service.
   - Details can be found at [Berichtencentrum-API](https://lblod.github.io/pages-vendors/#/docs/berichtencentrum-api).

2. **Harvest Job Scheduling:**
   This service schedules a harvest job to download the HTML page where the message is published, invoking [download-url-service](https://github.com/lblod/download-url-service).

3. **Delta Ingestion:**
   After the HTML page is download is ready, a delta is fired by [download-url-service](https://github.com/lblod/download-url-service) and ingested by this service.

4. **Content Validation & Attachment Check:**
   The service validates the content, verifies if there are any attachments, and if found, schedules them for download via [download-url-service](https://github.com/lblod/download-url-service) again.

5. **Completion Check:**
   Once all attachments are downloaded, this service publishes the `schema:Message` to the correct graph, if all conditions are met.

### A bit deeper
- **Submission Verification:** The incoming submission undergoes basic checks for required info and vendor permissions.

- **Job Creation:** The submission creates a `cogs:Job` with `task:operation`: `http://lblod.data.gift/id/jobs/concept/JobOperation/harvestBericht`, containing two tasks:
  1. **Operation Task:** `http://lblod.data.gift/id/jobs/concept/JobOperation/register-bericht`
     - Responsible for scheduling the HTML page download and is set to success upon successful download, triggering the [Job-controller-service](https://github.com/lblod/job-controller-service) to proceed to the next task.
  2. **Import Task:** `http://lblod.data.gift/id/jobs/concept/TaskOperation/import-bericht`
     - Parses the rdfa, extracts, and validates the content. If any attachments need downloading, they are scheduled via [download-url-service](https://github.com/lblod/download-url-service). This task is marked as successful once all conditions are met.


This process entails an elaborate interaction among three 'lblod' services:
- [Download-URL-Service](https://github.com/lblod/download-url-service)
- [Job-Controller-Service](https://github.com/lblod/job-controller-service)
- The current service

This while relying on Semantic-Works' backbone.

### Even deeper?
See code.

## API
Note: this is where you should put your breakpoints when debugging.

`POST /melding`
The entry point for vendors to trigger a new submission.
Refer to: [Berichtencentru-API](https://lblod.github.io/pages-vendors/#/docs/berichtencentrum-api)

`POST /delta`
The entry point for delta-messages to process deltas.


## Getting started

### Add the service to a stack

Add the service to your `docker-compose.yml`:

```yaml
  berichtencentrum-melding:
    image: lblod/berichten-melding-service:x.y.z
    volumes:
      - ./data/files:/share
```

Configure the dispatcher by adding the following rule:

```elixir
post "/vendor/berichtencentrum/melding/*path" do
  forward conn, path, "http://berichtencentrum-melding/melding"
end
```

Configure the Delta-notifier:
```javascript
[// Other config
{
  match: {
    predicate: {
      type: 'uri',
      value: 'http://www.w3.org/ns/adms#status'
    },
  },
  callback: {
    url: 'http://berichtencentrum-melding/delta',
    method: 'POST'
  },
  options: {
    resourceFormat: 'v0.0.1',
    gracePeriod: 0,
    ignoreFromSelf: true,
    optOutMuScopeIds: [
                        "http://redpencil.data.gift/id/concept/muScope/deltas/initialSync",
                        "http://redpencil.data.gift/id/concept/muScope/deltas/publicationGraphMaintenance"
                      ]
  }
}]
```

Configure the jobs-controller
```
{
  //other config
  "http://lblod.data.gift/id/jobs/concept/JobOperation/harvestBericht": {
    "tasksConfiguration": [
      {
        "currentOperation": "http://lblod.data.gift/id/jobs/concept/TaskOperation/register-bericht",
        "nextOperation": "http://lblod.data.gift/id/jobs/concept/TaskOperation/import-bericht",
        "nextIndex": "1"
      }
    ]
   }
 }
```

And if you want error alerts per mail (you do in production), you'll add to the config
```json
{
  "creators": [
    //Other creators
    "http://lblod.data.gift/services/prepare-submissions-for-export-service"
  ]
}
```
See [error-alert-service](https://github.com/lblod/loket-error-alert-service)

## How-to guides

### Make a submission of a `schema:Message`

Refer to: [Berichtencentrum-API](https://lblod.github.io/pages-vendors/#/docs/berichtencentrum-api)

### Authorize an agent to submit on behalf of an organization

To allow an organization to submit a publication on behalf of another
organization, add a resource similar to the example below:

```sparql
PREFIX muAccount:   <http://mu.semte.ch/vocabularies/account/>
PREFIX mu:   <http://mu.semte.ch/vocabularies/core/>
PREFIX foaf: <http://xmlns.com/foaf/0.1/>
PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>

INSERT DATA {
  GRAPH <http://mu.semte.ch/graphs/automatic-submission> {
    <http://example.com/vendor/d3c9e5e5-d50c-46c9-8f09-6af76712c277>
      a foaf:Agent, ext:Vendor ;
      muAccount:key "my-super-secret-key";
      muAccount:canActOnBehalfOf
        <http://data.lblod.info/id/bestuurseenheden/d64157ef-bde2-4814-b77a-2d43ce90d>;
      foaf:name "Test vendor";
      mu:uuid "d3c9e5e5-d50c-46c9-8f09-6af76712c277".
  }
}
```

### Model
This section briefly overviews the models used to achieve the goal of storing a message correctly.

#### `schema:Message` & `schema:Conversation`
This is the core of the data that is exchanged, for more information refer to: [Berichtencentrum-API](https://lblod.github.io/pages-vendors/#/docs/berichtencentrum-api).

#### `cogs:Job`
This information is used to control multiple steps in the harvesting of the `schema:Message`.
Refer to [Job-controller-service](https://github.com/lblod/job-controller-service) for more information.

### `nfo:RemoteDataObject` & `nfo:FileDataObject`
Attachments are exchanged; the metadata of this is stored in the database.

Refer to [Download-url-service](https://github.com/lblod/download-url-service)
  and [File-service](https://github.com/mu-semtech/file-service)

## Related services

The following services are also involved in the automatic processing of a
submission:

* [download-url-service](https://github.com/lblod/download-url-service)
* [Job-controller-service](https://github.com/lblod/job-controller-service)
