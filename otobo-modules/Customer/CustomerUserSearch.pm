# --
# OTOBO is a web-based ticketing system for service organisations.
# --
# Copyright (C) 2019-2025 Rother OSS GmbH, https://otobo.io/
# --
# This program is free software: you can redistribute it and/or modify it under
# the terms of the GNU General Public License as published by the Free Software
# Foundation, either version 3 of the License, or (at your option) any later version.
# This program is distributed in the hope that it will be useful, but WITHOUT
# ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
# FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
# You should have received a copy of the GNU General Public License
# along with this program. If not, see <https://www.gnu.org/licenses/>.
# --

package Kernel::GenericInterface::Operation::Customer::CustomerUserSearch;

use strict;
use warnings;

use parent qw(
    Kernel::GenericInterface::Operation::Common
    Kernel::GenericInterface::Operation::Customer::Common
);

# OTOBO modules
use Kernel::System::VariableCheck qw(IsArrayRefWithData IsHashRefWithData IsStringWithData);

our $ObjectManagerDisabled = 1;

=head1 NAME

Kernel::GenericInterface::Operation::Customer::CustomerUserSearch - GenericInterface Customer User Search Operation backend

=head1 PUBLIC INTERFACE

=head2 new()

usually, you want to create an instance of this
by using Kernel::GenericInterface::Operation->new();

=cut

sub new {
    my ( $Type, %Param ) = @_;

    my $Self = {};
    bless( $Self, $Type );

    # check needed objects
    for my $Needed (qw(DebuggerObject WebserviceID)) {
        if ( !$Param{$Needed} ) {
            return {
                Success      => 0,
                ErrorMessage => "Got no $Needed!",
            };
        }

        $Self->{$Needed} = $Param{$Needed};
    }

    return $Self;
}

=head2 Run()

perform CustomerUserSearch Operation. This will return a list of CustomerUser data.

    my $Result = $OperationObject->Run(
        Data => {
            UserLogin         => 'some agent login',        # UserLogin or CustomerUserLogin or SessionID is required
            CustomerUserLogin => 'some customer login',
            SessionID         => 123,
            Password          => 'some password',           # if UserLogin or CustomerUserLogin is sent then Password is required

            Search            => 'test*',                   # optional, search string (wildcards allowed)
            Limit             => 100,                       # optional, limit number of results (default: 100)
            Valid             => 1,                         # optional, default 1 (only valid customer users)

            # Extended search parameters (alternative to simple Search).
            # Prefer using the "Fields" hash to avoid collisions with auth keys.
            Fields           => {                           # optional
                UserLogin      => 'login*',                 # search by login
                UserEmail      => 'email*',                 # search by email
                UserFirstname  => 'John*',                  # search by first name
                UserLastname   => 'Doe*',                   # search by last name
                UserCustomerID => 'customer123',            # filter by CustomerID
            },
        },
    );

    $Result = {
        Success      => 1,                                  # 0 or 1
        ErrorMessage => '',                                 # In case of an error
        Data         => {
            CustomerUser => [
                {
                    UserLogin       => 'customer1',
                    UserEmail       => 'customer1@example.com',
                    UserCustomerID  => 'customer123',
                    UserFirstname   => 'John',
                    UserLastname    => 'Doe',
                    UserFullname    => 'John Doe',
                    UserTitle       => 'Mr',
                    UserPhone       => '123-456-7890',
                    UserMobile      => '098-765-4321',
                    UserStreet      => '123 Main St',
                    UserCity        => 'Anytown',
                    UserZip         => '12345',
                    UserCountry     => 'USA',
                    UserComment     => 'Some comment',
                    ValidID         => 1,
                    ChangeTime      => '2025-01-01 12:00:00',
                    CreateTime      => '2024-01-01 12:00:00',
                },
                # ... more customer users
            ]
        },
    };

=cut

sub Run {
    my ( $Self, %Param ) = @_;

    my $Result = $Self->Init(
        WebserviceID => $Self->{WebserviceID},
    );

    if ( !$Result->{Success} ) {
        return $Self->ReturnError(
            ErrorCode    => 'Webservice.InvalidConfiguration',
            ErrorMessage => $Result->{ErrorMessage},
        );
    }

    # Authenticate user
    my ( $UserID, $UserType ) = $Self->Auth(
        %Param,
    );

    return $Self->ReturnError(
        ErrorCode    => 'CustomerUserSearch.AuthFail',
        ErrorMessage => "CustomerUserSearch: Authorization failing!",
    ) if !$UserID;

    my $CustomerUserObject = $Kernel::OM->Get('Kernel::System::CustomerUser');

    # Prepare search parameters
    my %SearchParams;
    my $Limit = $Param{Data}->{Limit} || 100;
    my $Valid = $Param{Data}->{Valid} // 1;

    # Use simple search or detailed search
    my %CustomerUsers;

    if ( $Param{Data}->{Search} ) {
        # Simple search
        %CustomerUsers = $CustomerUserObject->CustomerSearch(
            Search => $Param{Data}->{Search},
            Valid  => $Valid,
            Limit  => $Limit,
        );
    }
    elsif ( IsHashRefWithData( $Param{Data}->{Fields} ) ) {
        # Detailed search with specific fields via Fields hash (avoids collisions with auth keys)
        %SearchParams = %{ $Param{Data}->{Fields} };

        %CustomerUsers = $CustomerUserObject->CustomerSearchDetail(
            %SearchParams,
            Valid => $Valid,
            Limit => $Limit,
        );
    }
    else {
        # No search criteria - return all (with limit)
        %CustomerUsers = $CustomerUserObject->CustomerSearch(
            Search => '*',
            Valid  => $Valid,
            Limit  => $Limit,
        );
    }

    # If no results found, return empty list
    if ( !%CustomerUsers ) {
        return {
            Success => 1,
            Data    => {
                CustomerUser => [],
            },
        };
    }

    # Build result array with full customer data
    my @CustomerUserList;

    for my $UserLogin ( sort keys %CustomerUsers ) {
        my %CustomerData = $CustomerUserObject->CustomerUserDataGet(
            User => $UserLogin,
        );

        if ( %CustomerData ) {
            push @CustomerUserList, \%CustomerData;
        }
    }

    # Return results
    return {
        Success => 1,
        Data    => {
            CustomerUser => \@CustomerUserList,
        },
    };
}

1;

=head1 TERMS AND CONDITIONS

This software comes with ABSOLUTELY NO WARRANTY. For details, see
the enclosed file COPYING for license information (GPL). If you
did not receive this file, see L<https://www.gnu.org/licenses/gpl-3.0.txt>.

=cut
