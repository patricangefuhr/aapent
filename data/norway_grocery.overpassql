[out:csv(::type,::id,::lat,::lon,name,brand,operator,shop,opening_hours,"addr:city","addr:postcode","addr:street",website,phone;true;"\t")][timeout:300];
area["ISO3166-1"="NO"][admin_level=2]->.no;
(
  nwr["shop"="supermarket"](area.no);
  nwr["shop"="convenience"](area.no);
);
out center;
