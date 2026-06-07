from jungle_grid_leads.text_utils import canonicalize_url, complaint_similarity


def test_canonicalize_url_strips_tracking_params() -> None:
    url = "https://www.example.com/post/?utm_source=newsletter&ref=abc&id=123"
    assert canonicalize_url(url) == "https://example.com/post?id=123"


def test_complaint_similarity_is_high_for_near_duplicates() -> None:
    left = "We cannot get H100 capacity from our GPU provider and need an alternative."
    right = "Our team can't get H100 instances from the current provider, need another option."
    assert complaint_similarity(left, right) >= 0.6
