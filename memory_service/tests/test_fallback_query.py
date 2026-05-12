from memory_service.wiki_store import WikiStore

def test_fallback_query(tmp_path):
    root = tmp_path / "wiki"
    root.mkdir()

    # Create relevant files
    (root / "workflow-event-recap-session-1.md").write_text("# Event Recap\nBody about calendar event")
    (root / "target-create-event.md").write_text("# Create Event\nInformation on how to create event")
    (root / "unrelated.md").write_text("# Something Else\nNothing to see here")

    store = WikiStore(str(root))

    query = "How do I create a calendar event from this event page?"
    results = store.search_fallback(query)

    assert len(results) > 0
    ids = [res["id"] for res in results]
    assert any("workflow-event-recap-session-1.md" in path for path in ids) or \
           any("target-create-event.md" in path for path in ids)
