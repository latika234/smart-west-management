import math


class RouteOptimizer:

    @staticmethod
    def calculate_distance(lat1, lon1, lat2, lon2):
        R = 6371  # Earth radius in KM
        dLat = math.radians(lat2 - lat1)
        dLon = math.radians(lon2 - lon1)

        a = (
            math.sin(dLat / 2) ** 2
            + math.cos(math.radians(lat1))
            * math.cos(math.radians(lat2))
            * math.sin(dLon / 2) ** 2
        )

        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
        return R * c
    
    @staticmethod
    def nearest_neighbor_route(bins):
        """
        bins = list of dictionaries:
        {
            'binID': ...,
            'location': {'lat': ..., 'lng': ...}
        }
        """

        if not bins:
            return []

        unvisited = bins.copy()
        route = []

        # Start from first bin
        current = unvisited.pop(0)
        route.append(current)

        while unvisited:
            nearest = min(
                unvisited,
                key=lambda bin: RouteOptimizer.calculate_distance(
                    current['location']['lat'],
                    current['location']['lng'],
                    bin['location']['lat'],
                    bin['location']['lng']
                )
            )

            route.append(nearest)
            unvisited.remove(nearest)
            current = nearest

        return route
    
    @staticmethod
    def total_distance(route):
        distance = 0

        for i in range(len(route) - 1):
            distance += RouteOptimizer.calculate_distance(
                route[i]['location']['lat'],
                route[i]['location']['lng'],
                route[i+1]['location']['lat'],
                route[i+1]['location']['lng']
            )

        return distance


    @staticmethod
    def two_opt(route):
        """
        Improve route using 2-opt algorithm
        """
        best = route
        improved = True

        while improved:
            improved = False
            best_distance = RouteOptimizer.total_distance(best)

            for i in range(1, len(best) - 2):
                for j in range(i + 1, len(best)):

                    if j - i == 1:
                        continue  # skip adjacent nodes

                    new_route = best[:]
                    new_route[i:j] = reversed(best[i:j])

                    new_distance = RouteOptimizer.total_distance(new_route)

                    if new_distance < best_distance:
                        best = new_route
                        improved = True
                        break

                if improved:
                    break

        return best
    
    @staticmethod
    def optimize_route(bins):
        """
        Full optimization:
        1. Nearest Neighbor
        2. 2-Opt Improvement
        """

        if len(bins) < 2:
            return bins

        # Step 1: Initial route
        nn_route = RouteOptimizer.nearest_neighbor_route(bins)

        # Step 2: Improve route
        optimized_route = RouteOptimizer.two_opt(nn_route)

        return optimized_route