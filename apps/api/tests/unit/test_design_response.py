"""DesignProjectResponse validation and legacy diagram merge (no Gemini)."""

from letaicook_api.routers.design import DesignProjectResponse


def test_legacy_diagram_keys_lifted_into_diagrams():
    data = {
        "project_name": "Demo",
        "architecture_diagram": "graph LR\nA-->B",
        "sequence_diagram": "sequenceDiagram\nA->>B: hi",
        "erd_diagram": "erDiagram\nX ||--o{ Y : has",
        "class_diagram": "classDiagram\nclass Foo",
        "user_flow_diagram": "flowchart TD\nA[Start]",
    }
    m = DesignProjectResponse.model_validate(data)
    assert m.diagrams["architecture"] == "graph LR\nA-->B"
    assert m.diagrams["sequence"] == "sequenceDiagram\nA->>B: hi"
    assert m.diagrams["erd"] == "erDiagram\nX ||--o{ Y : has"
    assert m.diagrams["class"] == "classDiagram\nclass Foo"
    assert m.diagrams["user_flow"] == "flowchart TD\nA[Start]"


def test_nested_diagrams_take_precedence_over_legacy():
    data = {
        "project_name": "Demo",
        "diagrams": {"architecture": "from nested"},
        "architecture_diagram": "from legacy",
    }
    m = DesignProjectResponse.model_validate(data)
    assert m.diagrams["architecture"] == "from nested"


def test_partial_diagrams_merge_legacy_for_missing_keys():
    data = {
        "project_name": "Demo",
        "diagrams": {"architecture": "nested arch"},
        "sequence_diagram": "only legacy seq",
    }
    m = DesignProjectResponse.model_validate(data)
    assert m.diagrams["architecture"] == "nested arch"
    assert m.diagrams["sequence"] == "only legacy seq"


def test_empty_diagrams_and_minimal_payload():
    m = DesignProjectResponse.model_validate({})
    assert m.project_name == ""
    assert m.diagrams == {}
