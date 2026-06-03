import math

from tour_agent.route import (
    nearest_neighbor_order,
    optimize_route,
    path_length,
    two_opt,
)


def euclid(a, b):
    return math.dist(a, b)


def test_path_length_open_path():
    assert path_length((0, 0), [(1, 0), (4, 0)], [0, 1], dist=euclid) == 4.0


def test_nearest_neighbor_picks_closest_each_step():
    start = (-1, 0)
    coords = [(0, 0), (5, 0), (1, 0)]
    assert nearest_neighbor_order(start, coords, dist=euclid) == [0, 2, 1]


def test_two_opt_reduces_crossing_path_length():
    start = (0, 0)
    coords = [(0, 2), (2, 2), (2, 0)]
    bad = [1, 0, 2]  # 교차하는 비효율 경로
    improved = two_opt(start, coords, bad, dist=euclid)

    assert path_length(start, coords, improved, dist=euclid) < path_length(
        start, coords, bad, dist=euclid
    )
    # 최적(0->1->2)보다 길지 않다.
    assert path_length(start, coords, improved, dist=euclid) <= path_length(
        start, coords, [0, 1, 2], dist=euclid
    ) + 1e-9


def test_optimize_route_collinear_sorts_by_distance():
    start = (0, 0)
    coords = [(3, 0), (1, 0), (2, 0)]
    assert optimize_route(start, coords, dist=euclid) == [1, 2, 0]
